import "server-only";

import { randomUUID } from "node:crypto";
import {
  type MusicGenerationProvider,
  type MusicGenerationRequest,
  type MusicGenerationResult,
  MusicGenerationError,
} from "./provider";
import { generateValidPcmWavBuffer } from "./simulated-audio";

export class ElevenLabsMusicProvider implements MusicGenerationProvider {
  readonly provider = "elevenlabs";
  readonly supportedModels = ["music_v2", "music_v1"] as const;

  private readonly apiKey?: string;

  constructor(options: { apiKey?: string }) {
    this.apiKey = options.apiKey?.trim();
  }

  async generate(
    request: MusicGenerationRequest,
  ): Promise<MusicGenerationResult> {
    const model = request.model || "music_v2";
    const durationSeconds = Math.max(
      3,
      Math.min(request.durationSeconds || 30, 300),
    );

    // DRY-RUN OR OFFLINE MODE:
    if (request.dryRun || !this.apiKey) {
      const audioBuffer = generateValidPcmWavBuffer({
        durationSeconds: Math.min(durationSeconds, 30),
        frequency: 329.63, // E4
      });

      return {
        id: randomUUID(),
        audioBuffer,
        mimeType: "audio/wav",
        containerFormat: "wav",
        durationMs: durationSeconds * 1000,
        provider: this.provider,
        model,
        prompt: request.prompt,
        parameters: {
          durationSeconds,
          instrumentalOnly: request.instrumentalOnly,
          tempoBpm: request.tempoBpm ?? null,
          genre: request.genre ?? null,
          seed: request.seed ?? null,
        },
        isSimulated: true,
        createdAt: new Date(),
      };
    }

    // REAL MODE:
    try {
      const endpoint = "https://api.elevenlabs.io/v1/music";
      const payload = {
        prompt: request.prompt,
        model_id: model,
        music_length_ms: durationSeconds * 1000,
        force_instrumental: request.instrumentalOnly,
        ...(request.seed !== null && request.seed !== undefined
          ? { seed: request.seed }
          : {}),
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new MusicGenerationError(
            "RATE_LIMITED",
            "ElevenLabs generation rate limit reached.",
          );
        }
        if (response.status === 402) {
          throw new MusicGenerationError(
            "INSUFFICIENT_CREDITS",
            "ElevenLabs account has insufficient character/generation credits.",
          );
        }
        throw new MusicGenerationError(
          "PROVIDER_FAILURE",
          `ElevenLabs Music API returned status ${response.status}: ${errorText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      return {
        id: randomUUID(),
        audioBuffer,
        mimeType: "audio/mpeg",
        containerFormat: "mp3",
        durationMs: durationSeconds * 1000,
        provider: this.provider,
        model,
        prompt: request.prompt,
        parameters: {
          durationSeconds,
          instrumentalOnly: request.instrumentalOnly,
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
          : "Failed to generate music with ElevenLabs",
      );
    }
  }
}
