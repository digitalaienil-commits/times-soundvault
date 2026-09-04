import "server-only";

import { randomUUID } from "node:crypto";
import { generateValidPcmWavBuffer } from "./simulated-audio";

export const GENERATION_ASSET_KINDS = ["music", "sound_effect"] as const;
export type GenerationAssetKind = (typeof GENERATION_ASSET_KINDS)[number];

export type GenerationProviderKind =
  "google_lyria" | "elevenlabs" | "simulated";

export interface GenerationModelOption {
  id: string;
  label: string;
  maxDurationSeconds: number;
}

export interface GenerationProviderOption {
  provider: GenerationProviderKind;
  label: string;
  description: string;
  live: boolean;
  assetKinds: readonly GenerationAssetKind[];
  models: Partial<
    Record<GenerationAssetKind, readonly GenerationModelOption[]>
  >;
}

export interface MusicGenerationRequest {
  prompt: string;
  assetKind: GenerationAssetKind;
  provider: GenerationProviderKind;
  model: string;
  durationSeconds: number;
  instrumentalOnly: boolean;
  tempoBpm?: number | null;
  genre?: string | null;
  seed?: number | null;
  loop?: boolean;
  promptInfluence?: number | null;
  dryRun?: boolean;
}

export interface MusicGenerationResult {
  id: string;
  assetKind: GenerationAssetKind;
  audioBuffer: Buffer;
  mimeType: "audio/wav" | "audio/mpeg";
  containerFormat: "wav" | "mp3";
  durationMs: number;
  provider: GenerationProviderKind;
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
  readonly provider: GenerationProviderKind;
  readonly supportedModels: readonly string[];
  generate(request: MusicGenerationRequest): Promise<MusicGenerationResult>;
}

export class SimulatedMusicProvider implements MusicGenerationProvider {
  readonly provider = "simulated";
  readonly supportedModels = ["simulated-v1"] as const;

  async generate(
    request: MusicGenerationRequest,
  ): Promise<MusicGenerationResult> {
    const durationSeconds = Math.max(
      request.assetKind === "sound_effect" ? 0.5 : 1,
      Math.min(request.durationSeconds, 30),
    );
    const audioBuffer = generateValidPcmWavBuffer({
      durationSeconds,
      frequency: request.assetKind === "sound_effect" ? 196 : 440,
    });

    return {
      id: randomUUID(),
      assetKind: request.assetKind,
      audioBuffer,
      mimeType: "audio/wav",
      containerFormat: "wav",
      durationMs: durationSeconds * 1000,
      provider: this.provider,
      model: "simulated-v1",
      prompt: request.prompt,
      parameters: {
        assetKind: request.assetKind,
        instrumentalOnly: request.instrumentalOnly,
        tempoBpm: request.tempoBpm ?? null,
        genre: request.genre ?? null,
        durationSeconds,
        seed: request.seed ?? null,
        loop: request.loop ?? false,
        promptInfluence: request.promptInfluence ?? null,
      },
      isSimulated: true,
      createdAt: new Date(),
    };
  }
}
