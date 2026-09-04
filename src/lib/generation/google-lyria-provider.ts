import "server-only";

import { randomUUID } from "node:crypto";
import {
  type MusicGenerationProvider,
  type MusicGenerationRequest,
  type MusicGenerationResult,
  MusicGenerationError,
} from "./provider";
import { generateValidPcmWavBuffer } from "./simulated-audio";

export class GoogleLyriaProvider implements MusicGenerationProvider {
  readonly provider = "google_lyria";
  readonly supportedModels = [
    "lyria-3-clip-preview",
    "lyria-3-pro-preview",
  ] as const;

  private readonly apiKey?: string;

  constructor(options: { apiKey?: string }) {
    this.apiKey = options.apiKey?.trim();
  }

  async generate(
    request: MusicGenerationRequest,
  ): Promise<MusicGenerationResult> {
    if (request.assetKind !== "music") {
      throw new MusicGenerationError(
        "VALIDATION_ERROR",
        "Google Lyria is available for music generation only.",
      );
    }
    const model = request.model || "lyria-3-clip-preview";
    const maxDuration = model === "lyria-3-clip-preview" ? 30 : 180;
    const durationSeconds = Math.max(
      1,
      Math.min(request.durationSeconds || 30, maxDuration),
    );

    // DRY-RUN OR OFFLINE MODE:
    // When dry-run is active or no API key is provided, never hit the external billing endpoint.
    if (request.dryRun || !this.apiKey) {
      const audioBuffer = generateValidPcmWavBuffer({
        durationSeconds,
        frequency: model === "lyria-3-clip-preview" ? 523.25 : 440, // C5 vs A4
      });

      return {
        id: randomUUID(),
        assetKind: "music",
        audioBuffer,
        mimeType: "audio/wav",
        containerFormat: "wav",
        durationMs: durationSeconds * 1000,
        provider: this.provider,
        model,
        prompt: request.prompt,
        parameters: {
          assetKind: "music",
          durationSeconds,
          instrumentalOnly: request.instrumentalOnly,
          tempoBpm: request.tempoBpm ?? null,
          genre: request.genre ?? null,
          seed: request.seed ?? null,
          watermark: "SynthID",
        },
        isSimulated: true,
        createdAt: new Date(),
      };
    }

    // REAL MODE:
    try {
      const endpoint =
        "https://generativelanguage.googleapis.com/v1beta/interactions";
      const input = request.instrumentalOnly
        ? `${request.prompt}\nInstrumental only, no vocals.`
        : request.prompt;
      const payload = { model, input };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new MusicGenerationError(
            "RATE_LIMITED",
            "Google Lyria generation rate limit reached.",
          );
        }
        throw new MusicGenerationError(
          "PROVIDER_FAILURE",
          `Google Lyria API returned status ${response.status}: ${errorText}`,
        );
      }

      const json = (await response.json()) as {
        output_audio?: { data?: string; mime_type?: string; mimeType?: string };
        outputAudio?: { data?: string; mime_type?: string; mimeType?: string };
      };

      const outputAudio = json.output_audio ?? json.outputAudio;
      const rawBase64 = outputAudio?.data;
      if (!rawBase64) {
        throw new MusicGenerationError(
          "PROVIDER_FAILURE",
          "Google Lyria response did not contain audio data.",
        );
      }

      const audioBuffer = Buffer.from(rawBase64, "base64");
      return {
        id: randomUUID(),
        assetKind: "music",
        audioBuffer,
        mimeType: "audio/mpeg",
        containerFormat: "mp3",
        durationMs: durationSeconds * 1000,
        provider: this.provider,
        model,
        prompt: request.prompt,
        parameters: {
          assetKind: "music",
          durationSeconds,
          instrumentalOnly: request.instrumentalOnly,
          tempoBpm: request.tempoBpm ?? null,
          genre: request.genre ?? null,
          seed: request.seed ?? null,
          watermark: "SynthID",
        },
        isSimulated: false,
        createdAt: new Date(),
      };
    } catch (error) {
      if (error instanceof MusicGenerationError) throw error;
      throw new MusicGenerationError(
        "PROVIDER_FAILURE",
        error instanceof Error
          ? error.message
          : "Failed to generate music with Google Lyria",
      );
    }
  }
}
