import "server-only";

import { z } from "zod";

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const environmentSchema = z.object({
  AI_ANALYSIS_ENABLED: z.string().trim().optional(),
  AI_ANALYSIS_MODEL: z.string().trim().min(1).default("gemini-3.5-flash-lite"),
  AI_ANALYSIS_FALLBACK_MODELS: z
    .string()
    .trim()
    .default("gemini-3.5-flash,gemini-3.1-flash-lite"),
  AI_ANALYSIS_TIMEOUT_MS: positiveInteger(60_000),
  ESSENTIA_SAMPLE_RATE_HZ: positiveInteger(22_050),
  ESSENTIA_MAX_DURATION_SECONDS: positiveInteger(180),
  GEMINI_API_KEY: z.string().trim().optional(),
});

export interface AiAnalysisConfig {
  enabled: boolean;
  model: string;
  fallbackModels: string[];
  timeoutMs: number;
  sampleRateHz: number;
  maxDurationSeconds: number;
  geminiApiKey?: string;
}

function booleanEnabled(value: string | undefined): boolean {
  if (!value) return true;
  return !["0", "false", "off", "no", "disabled"].includes(
    value.trim().toLowerCase(),
  );
}

export function parseAiAnalysisConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AiAnalysisConfig {
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("NEXT_PUBLIC_") &&
      /GEMINI|AI_ANALYSIS|ESSENTIA/.test(key)
    ) {
      throw new Error(
        "AI analysis credentials must never use NEXT_PUBLIC_ variables",
      );
    }
  }

  const parsed = environmentSchema.parse(env);
  const sampleRateHz = Math.min(
    Math.max(parsed.ESSENTIA_SAMPLE_RATE_HZ, 8_000),
    48_000,
  );
  const maxDurationSeconds = Math.min(
    parsed.ESSENTIA_MAX_DURATION_SECONDS,
    600,
  );
  const geminiApiKey = parsed.GEMINI_API_KEY?.trim() || undefined;
  const fallbackModels = parsed.AI_ANALYSIS_FALLBACK_MODELS.split(",")
    .map((model) => model.trim())
    .filter((model) => model && model !== parsed.AI_ANALYSIS_MODEL)
    .slice(0, 4);

  return {
    enabled: booleanEnabled(parsed.AI_ANALYSIS_ENABLED),
    model: parsed.AI_ANALYSIS_MODEL,
    fallbackModels,
    timeoutMs: Math.min(parsed.AI_ANALYSIS_TIMEOUT_MS, 180_000),
    sampleRateHz,
    maxDurationSeconds,
    geminiApiKey,
  };
}
