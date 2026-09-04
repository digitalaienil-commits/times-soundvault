import "server-only";

import { randomUUID } from "node:crypto";
import { generateValidPcmWavBuffer } from "./simulated-audio";

export interface MusicGenerationRequest {
  prompt: string;
  provider: "google_lyria" | "elevenlabs" | "simulated";
  model: string;
  durationSeconds: number;
  instrumentalOnly: boolean;
  tempoBpm?: number | null;
  genre?: string | null;
  seed?: number | null;
  dryRun?: boolean;
}

export interface MusicGenerationResult {
  id: string;
  audioBuffer: Buffer;
  mimeType: "audio/wav" | "audio/mpeg";
  containerFormat: "wav" | "mp3";
  durationMs: number;
  provider: string;
  model: string;
  prompt: string;
  parameters: Record<string, unknown>;
  isSimulated: boolean;
  createdAt: Date;
}

export class MusicGenerationError extends Error {
  constructor(
    public readonly code:
      | "CONFIG_ERROR"
      | "VALIDATION_ERROR"
      | "RATE_LIMITED"
      | "INSUFFICIENT_CREDITS"
      | "PROVIDER_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "MusicGenerationError";
  }
}

export interface MusicGenerationProvider {
  readonly provider: string;
  readonly supportedModels: readonly string[];
  generate(request: MusicGenerationRequest): Promise<MusicGenerationResult>;
}

export class SimulatedMusicProvider implements MusicGenerationProvider {
  readonly provider = "simulated";
  readonly supportedModels = ["simulated-v1"] as const;

  async generate(
    request: MusicGenerationRequest,
  ): Promise<MusicGenerationResult> {
    const durationSeconds = Math.max(1, Math.min(request.durationSeconds, 30));
    const audioBuffer = generateValidPcmWavBuffer({
      durationSeconds,
      frequency: 440,
    });

    return {
      id: randomUUID(),
      audioBuffer,
      mimeType: "audio/wav",
      containerFormat: "wav",
      durationMs: durationSeconds * 1000,
      provider: this.provider,
      model: "simulated-v1",
      prompt: request.prompt,
      parameters: {
        instrumentalOnly: request.instrumentalOnly,
        tempoBpm: request.tempoBpm ?? null,
        genre: request.genre ?? null,
        durationSeconds,
        seed: request.seed ?? null,
      },
      isSimulated: true,
      createdAt: new Date(),
    };
  }
}
