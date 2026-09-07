import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import type { AudioMeasurements } from "@/lib/audio/ffmpeg";
import type { ProbedAudio } from "@/lib/audio/ffprobe";
import type { ProcessingSourceFile } from "@/lib/processing/repository";
import type { NormalizedAnalysisResult } from "@/types/processing";

import type { AiAnalysisConfig } from "./config";
import type { LocalMusicFeatures } from "./local-features";

const textArray = z.array(z.string()).max(12).default([]);
const nullableNumber = z.number().finite().nullable().default(null);
const nullableString = z.string().nullable().default(null);

const geminiMetadataSchema = z.object({
  genres: textArray,
  subgenres: textArray,
  moods: textArray,
  instruments: textArray,
  bpm: nullableNumber,
  bpmRangeAdjusted: nullableNumber,
  key: nullableString,
  timeSignature: nullableString,
  energy: z.union([z.string(), z.number()]).nullable().default(null),
  energyDynamics: nullableString,
  valence: nullableNumber,
  arousal: nullableNumber,
  vocalState: z
    .enum(["unknown", "instrumental", "vocal", "mixed"])
    .nullable()
    .default(null),
  voiceTags: textArray,
  voiceoverExists: z.boolean().nullable().default(null),
  voiceoverDegree: nullableNumber,
  character: textArray,
  movement: textArray,
  musicalEra: nullableString,
  transformerCaption: nullableString,
  freeGenreTags: textArray,
  segmentIntervalSeconds: nullableNumber,
  segments: z
    .array(
      z.object({
        startSeconds: z.number().finite(),
        endSeconds: z.number().finite(),
        valence: z.number().finite().optional(),
        arousal: z.number().finite().optional(),
      }),
    )
    .max(24)
    .default([]),
});

export interface UnifiedAiMetadata {
  providerVersion: string;
  inputMetadata: Record<string, unknown>;
  rawResult: Record<string, unknown>;
  normalizedResult: NormalizedAnalysisResult;
}

export class AiAnalysisError extends Error {
  constructor(
    public readonly code: "CONFIG_ERROR" | "PROVIDER_FAILURE" | "RATE_LIMITED",
    message: string,
  ) {
    super(message);
    this.name = "AiAnalysisError";
  }
}

function cleanText(value: string, max = 80): string | null {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function cleanArray(values: string[], max = 8): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
    if (output.length >= max) break;
  }
  return output;
}

function splitTags(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[;,/|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clamp01(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function normalizeMetadata(
  parsed: z.infer<typeof geminiMetadataSchema>,
  fallback: NormalizedAnalysisResult,
): NormalizedAnalysisResult {
  const bpm = parsed.bpm ?? fallback.bpm;
  const bpmRangeAdjusted = parsed.bpmRangeAdjusted ?? bpm;
  return {
    genres: cleanArray(parsed.genres, 8),
    subgenres: cleanArray(parsed.subgenres, 8),
    moods: cleanArray(parsed.moods, 8),
    instruments: cleanArray(parsed.instruments, 10),
    bpm,
    bpmRangeAdjusted,
    key: parsed.key ? cleanText(parsed.key, 40) : fallback.key,
    timeSignature: parsed.timeSignature
      ? cleanText(parsed.timeSignature, 20)
      : fallback.timeSignature,
    energy: parsed.energy ?? fallback.energy,
    energyDynamics: parsed.energyDynamics
      ? cleanText(parsed.energyDynamics, 80)
      : fallback.energyDynamics,
    valence: clamp01(parsed.valence ?? fallback.valence),
    arousal: clamp01(parsed.arousal ?? fallback.arousal),
    vocalState: parsed.vocalState ?? fallback.vocalState,
    voiceTags: cleanArray(parsed.voiceTags, 8),
    voiceoverExists: parsed.voiceoverExists ?? fallback.voiceoverExists,
    voiceoverDegree: clamp01(
      parsed.voiceoverDegree ?? fallback.voiceoverDegree,
    ),
    character: cleanArray(parsed.character, 8),
    movement: cleanArray(parsed.movement, 8),
    musicalEra: parsed.musicalEra
      ? cleanText(parsed.musicalEra, 80)
      : fallback.musicalEra,
    transformerCaption: parsed.transformerCaption
      ? cleanText(parsed.transformerCaption, 500)
      : fallback.transformerCaption,
    freeGenreTags: cleanArray(parsed.freeGenreTags, 10),
    segmentIntervalSeconds:
      parsed.segmentIntervalSeconds ?? fallback.segmentIntervalSeconds,
    segments: parsed.segments
      .filter((segment) => segment.endSeconds > segment.startSeconds)
      .map((segment) => ({
        startSeconds: Math.max(0, Math.round(segment.startSeconds * 100) / 100),
        endSeconds: Math.max(0, Math.round(segment.endSeconds * 100) / 100),
        ...(segment.valence == null
          ? {}
          : { valence: clamp01(segment.valence) ?? undefined }),
        ...(segment.arousal == null
          ? {}
          : { arousal: clamp01(segment.arousal) ?? undefined }),
      })),
  };
}

function energyLabel(features: LocalMusicFeatures): string | null {
  const danceability = features.danceability ?? 0;
  const rms = features.rms ?? 0;
  if (danceability > 1 || rms > 0.18) return "high";
  if (danceability > 0.35 || rms > 0.07) return "medium";
  return "low";
}

export function buildLocalMetadataFallback(input: {
  source: ProcessingSourceFile;
  probe: ProbedAudio;
  measurements: AudioMeasurements;
  features: LocalMusicFeatures;
}): NormalizedAnalysisResult {
  const genres = cleanArray(splitTags(input.probe.embeddedTags.genre), 4);
  const key =
    input.features.key && input.features.keyScale
      ? `${input.features.key} ${input.features.keyScale}`
      : input.features.key;
  const energy = energyLabel(input.features);
  const title =
    cleanText(input.probe.embeddedTags.title ?? "", 120) ??
    cleanText(input.source.displayTitle, 120) ??
    cleanText(input.source.originalFilename, 120) ??
    "Untitled audio";
  const tempo = input.features.bpm
    ? `${input.features.bpm} BPM`
    : "unknown tempo";
  const caption = `${title} is an internal SoundVault track with ${tempo}${
    key ? ` in ${key}` : ""
  } and ${energy ?? "unknown"} energy.`;

  return {
    genres,
    subgenres: [],
    moods: [],
    instruments: [],
    bpm: input.features.bpm,
    bpmRangeAdjusted: input.features.bpm,
    key,
    timeSignature: null,
    energy,
    energyDynamics:
      input.features.dynamicComplexity == null
        ? null
        : `Dynamic complexity ${input.features.dynamicComplexity}`,
    valence: null,
    arousal: null,
    vocalState: "unknown",
    voiceTags: [],
    voiceoverExists: null,
    voiceoverDegree: null,
    character: [],
    movement: [],
    musicalEra: null,
    transformerCaption: caption,
    freeGenreTags: genres,
    segmentIntervalSeconds: null,
    segments: [],
  };
}

function buildPrompt(input: {
  source: ProcessingSourceFile;
  probe: ProbedAudio;
  measurements: AudioMeasurements;
  features: LocalMusicFeatures;
  fallback: NormalizedAnalysisResult;
}): string {
  return JSON.stringify(
    {
      instruction:
        "Act as SoundVault's internal metadata assistant. Return JSON only. Use the supplied FFmpeg/ffprobe facts and Essentia music features. Do not make rights, copyright, ownership, or approval claims. Prefer null or [] when uncertain.",
      outputShape: Object.keys(geminiMetadataSchema.shape),
      source: {
        displayTitle: input.source.displayTitle,
        originalFilename: input.source.originalFilename,
        assetRole: input.source.assetRole,
      },
      ffprobe: input.probe,
      ffmpegMeasurements: input.measurements,
      essentiaFeatures: input.features,
      localFallback: input.fallback,
    },
    null,
    2,
  );
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new AiAnalysisError("PROVIDER_FAILURE", "Gemini analysis timed out"),
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractText(response: unknown): string {
  const maybeText = (response as { text?: unknown }).text;
  if (typeof maybeText === "string") return maybeText;
  if (typeof maybeText === "function") {
    const called = maybeText.call(response);
    if (typeof called === "string") return called;
  }
  return "";
}

function geminiModels(config: AiAnalysisConfig): string[] {
  return [config.model, ...config.fallbackModels].filter(
    (model, index, models) => model && models.indexOf(model) === index,
  );
}

function classifyGeminiFailure(message: string): AiAnalysisError {
  if (
    message.includes("429") ||
    message.toLowerCase().includes("quota") ||
    message.toLowerCase().includes("rate limit")
  ) {
    return new AiAnalysisError(
      "RATE_LIMITED",
      `Gemini analysis rate limited: ${message}`,
    );
  }
  return new AiAnalysisError(
    "PROVIDER_FAILURE",
    `Gemini analysis failed: ${message}`,
  );
}

export async function createUnifiedAiMetadata(
  config: AiAnalysisConfig,
  input: {
    source: ProcessingSourceFile;
    probe: ProbedAudio;
    measurements: AudioMeasurements;
    features: LocalMusicFeatures;
  },
): Promise<UnifiedAiMetadata> {
  if (!config.geminiApiKey) {
    throw new AiAnalysisError(
      "CONFIG_ERROR",
      "GEMINI_API_KEY is required for SoundVault AI metadata analysis",
    );
  }

  const fallback = buildLocalMetadataFallback(input);
  const client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = buildPrompt({ ...input, fallback });
  let lastError: AiAnalysisError | null = null;

  for (const model of geminiModels(config)) {
    try {
      const response = await withTimeout(
        client.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
        config.timeoutMs,
      );
      const text = extractText(response);
      const rawParsed = JSON.parse(text) as Record<string, unknown>;
      const parsed = geminiMetadataSchema.parse(rawParsed);
      return {
        providerVersion: `${model}:essentia-js`,
        inputMetadata: {
          model,
          configuredPrimaryModel: config.model,
          fallbackModels: config.fallbackModels,
          localFeatureSource: input.features.source,
          essentiaVersion: input.features.essentiaVersion,
          analyzedDurationMs: input.features.analyzedDurationMs,
          sampleRateHz: input.features.sampleRateHz,
        },
        rawResult: rawParsed,
        normalizedResult: normalizeMetadata(parsed, fallback),
      };
    } catch (error) {
      if (error instanceof AiAnalysisError) {
        lastError = error;
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      lastError = classifyGeminiFailure(message);
    }
  }

  if (lastError) throw lastError;
  throw new AiAnalysisError(
    "CONFIG_ERROR",
    "No Gemini model is configured for SoundVault AI metadata analysis",
  );
}
