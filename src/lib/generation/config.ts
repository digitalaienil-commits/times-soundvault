import "server-only";

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
