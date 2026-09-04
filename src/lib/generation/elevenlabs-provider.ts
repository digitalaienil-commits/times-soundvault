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
  readonly supportedModels = [
    "music_v2",
    "music_v1",
    "eleven_text_to_sound_v2",
  ] as const;

  private readonly apiKey?: string;

  constructor(options: { apiKey?: string }) {
    this.apiKey = options.apiKey?.trim();
  }

  async generate(
    request: MusicGenerationRequest,
  ): Promise<MusicGenerationResult> {
    if (request.assetKind === "sound_effect") {
      return this.generateSoundEffect(request);
    }

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

  private async generateSoundEffect(
    request: MusicGenerationRequest,
  ): Promise<MusicGenerationResult> {
    const model = request.model || "eleven_text_to_sound_v2";
    const durationSeconds = Math.max(
      0.5,
      Math.min(request.durationSeconds || 5, 30),
    );
    const promptInfluence = Math.max(
      0,
      Math.min(request.promptInfluence ?? 0.3, 1),
    );

    if (request.dryRun || !this.apiKey) {
      const audioBuffer = generateValidPcmWavBuffer({
        durationSeconds,
        frequency: request.loop ? 130.81 : 196,
      });

      return {
        id: randomUUID(),
        assetKind: "sound_effect",
        audioBuffer,
        mimeType: "audio/wav",
        containerFormat: "wav",
        durationMs: Math.round(durationSeconds * 1000),
        provider: this.provider,
        model,
        prompt: request.prompt,
        parameters: {
          assetKind: "sound_effect",
          durationSeconds,
          loop: request.loop ?? false,
          promptInfluence,
        },
        isSimulated: true,
        createdAt: new Date(),
      };
    }

    try {
      const endpoint =
        "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";
      const payload = {
        text: request.prompt,
        model_id: model,
        duration_seconds: durationSeconds,
        loop: request.loop ?? false,
        prompt_influence: promptInfluence,
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
        if (response.status === 429) {
          throw new MusicGenerationError(
            "RATE_LIMITED",
            "ElevenLabs sound-effects rate limit reached.",
          );
        }
        if (response.status === 402) {
          throw new MusicGenerationError(
            "INSUFFICIENT_CREDITS",
            "ElevenLabs account has insufficient generation credits.",
          );
        }
        throw new MusicGenerationError(
          "PROVIDER_FAILURE",
          `ElevenLabs Sound Effects API returned status ${response.status}.`,
        );
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      return {
        id: randomUUID(),
        assetKind: "sound_effect",
        audioBuffer,
        mimeType: "audio/mpeg",
        containerFormat: "mp3",
        durationMs: Math.round(durationSeconds * 1000),
        provider: this.provider,
        model,
        prompt: request.prompt,
        parameters: {
          assetKind: "sound_effect",
          durationSeconds,
          loop: request.loop ?? false,
          promptInfluence,
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
          : "Failed to generate sound effects with ElevenLabs",
      );
    }
  }
}
