import "server-only";

import type {
  GenerationAssetKind,
  GenerationModelOption,
  GenerationProviderOption,
} from "./provider";

export type GenerationProviderKind =
  "google_lyria" | "elevenlabs" | "simulated";

export interface GenerationConfig {
  provider: GenerationProviderKind;
  dryRun: boolean;
  geminiApiKey?: string;
  elevenLabsApiKey?: string;
  maxDurationSeconds: number;
}

export function parseGenerationConfig(
  env: NodeJS.ProcessEnv = process.env,
): GenerationConfig {
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("NEXT_PUBLIC_") &&
      /GEMINI|ELEVENLABS|GENERATION/.test(key)
    ) {
      throw new Error(
        "Generation credentials must never use NEXT_PUBLIC_ variables",
      );
    }
  }

  const rawProvider = env.GENERATION_PROVIDER?.trim().toLowerCase();
  let provider: GenerationProviderKind = "google_lyria";
  if (rawProvider === "elevenlabs") {
    provider = "elevenlabs";
  } else if (rawProvider === "simulated") {
    provider = "simulated";
  } else if (rawProvider === "google_lyria") {
    provider = "google_lyria";
  }

  // DRY RUN is ON by default!
  // Opening /generate or running tests must NEVER spend money unless explicitly disabled
  const dryRun = env.GENERATION_DRY_RUN !== "false";

  const geminiApiKey = env.GEMINI_API_KEY?.trim();
  const elevenLabsApiKey = env.ELEVENLABS_API_KEY?.trim();

  const rawMaxDuration = env.MAX_GENERATION_DURATION_SECONDS?.trim();
  const maxDurationSeconds = rawMaxDuration
    ? parseInt(rawMaxDuration, 10)
    : 180;

  return {
    provider,
    dryRun,
    geminiApiKey,
    elevenLabsApiKey,
    maxDurationSeconds,
  };
}

const GOOGLE_LYRIA_MODELS = [
  {
    id: "lyria-3-clip-preview",
    label: "Lyria 3 Clip Preview",
    maxDurationSeconds: 30,
  },
  {
    id: "lyria-3-pro-preview",
    label: "Lyria 3 Pro Preview",
    maxDurationSeconds: 180,
  },
] as const satisfies readonly GenerationModelOption[];

const ELEVENLABS_MUSIC_MODELS = [
  { id: "music_v2", label: "Music v2", maxDurationSeconds: 300 },
  { id: "music_v1", label: "Music v1", maxDurationSeconds: 300 },
] as const satisfies readonly GenerationModelOption[];

const ELEVENLABS_SOUND_EFFECT_MODELS = [
  {
    id: "eleven_text_to_sound_v2",
    label: "Text to Sound v2",
    maxDurationSeconds: 30,
  },
] as const satisfies readonly GenerationModelOption[];

const SIMULATED_MODELS = [
  { id: "simulated-v1", label: "Local simulation", maxDurationSeconds: 30 },
] as const satisfies readonly GenerationModelOption[];

function modelMap(
  input: Partial<Record<GenerationAssetKind, readonly GenerationModelOption[]>>,
) {
  return input;
}

export function getAvailableGenerationProviders(
  config: GenerationConfig = parseGenerationConfig(),
): readonly GenerationProviderOption[] {
  const providers: GenerationProviderOption[] = [];

  if (config.geminiApiKey) {
    providers.push({
      provider: "google_lyria",
      label: "Google Lyria 3",
      description: "Configured Gemini music generation provider.",
      live: true,
      assetKinds: ["music"],
      models: modelMap({ music: GOOGLE_LYRIA_MODELS }),
    });
  }

  if (config.elevenLabsApiKey) {
    providers.push({
      provider: "elevenlabs",
      label: "ElevenLabs",
      description: "Configured music and sound-effects provider.",
      live: true,
      assetKinds: ["music", "sound_effect"],
      models: modelMap({
        music: ELEVENLABS_MUSIC_MODELS,
        sound_effect: ELEVENLABS_SOUND_EFFECT_MODELS,
      }),
    });
  }

  if (config.dryRun || providers.length === 0) {
    providers.push({
      provider: "simulated",
      label: "Local simulation",
      description: "Offline safe mode for development and zero-billing tests.",
      live: false,
      assetKinds: ["music", "sound_effect"],
      models: modelMap({
        music: SIMULATED_MODELS,
        sound_effect: SIMULATED_MODELS,
      }),
    });
  }

  return providers;
}
