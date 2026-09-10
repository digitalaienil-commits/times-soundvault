import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import type { AudioMeasurements } from "@/lib/audio/ffmpeg";
import type { ProbedAudio } from "@/lib/audio/ffprobe";
import type { ProcessingSourceFile } from "@/lib/processing/repository";
import type { NormalizedAnalysisResult } from "@/types/processing";

import type { AiAnalysisConfig } from "./config";
import type { AnalysisExcerpt } from "@/lib/audio/analysis-excerpt";
import type { LocalMusicFeatures } from "./local-features";

/**
 * Provider output is model-generated JSON, not a typed API response. A model
 * returns "0.8" as readily as 0.8, or a comma-separated string where an array
 * was asked for. Rejecting the whole document over that discarded an otherwise
 * complete analysis, so unreadable fields become null or [] and the rest
 * survives.
 */
const textArray = z
  .preprocess((value) => {
    const items = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [];
    return items
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }, z.array(z.string()))
  .default([]);

const nullableNumber = z
  .preprocess((value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return value ?? null;
  }, z.number().finite().nullable())
  .default(null);

const nullableString = z
  .preprocess(
    (value) => (typeof value === "string" ? value : (value ?? null)),
    z.string().nullable(),
  )
  .default(null);

const nullableBoolean = z
  .preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const text = value.trim().toLowerCase();
      if (["true", "yes", "1"].includes(text)) return true;
      if (["false", "no", "0"].includes(text)) return false;
    }
    return null;
  }, z.boolean().nullable())
  .default(null);

export const geminiMetadataSchema = z.object({
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
    .preprocess(
      (value) =>
        typeof value === "string" ? value.trim().toLowerCase() : value,
      z.enum(["unknown", "instrumental", "vocal", "mixed"]).nullable(),
    )
    .default(null)
    .catch(null),
  voiceTags: textArray,
  voiceoverExists: nullableBoolean,
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
    .default([])
    .catch([]),
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

/**
 * Models occasionally answer an object request with a one-element array. That
 * is a formatting quirk rather than a failed analysis, so unwrap it instead of
 * discarding a good result.
 */
export function unwrapMetadataObject(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const first = value.find(
      (entry) => entry && typeof entry === "object" && !Array.isArray(entry),
    );
    if (first) return first as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

export function buildPrompt(input: {
  source: ProcessingSourceFile;
  probe: ProbedAudio;
  measurements: AudioMeasurements;
  features: LocalMusicFeatures;
  fallback: NormalizedAnalysisResult;
  hasAudio: boolean;
}): string {
  return JSON.stringify(
    {
      instruction: input.hasAudio
        ? "Act as SoundVault's internal metadata assistant. An audio excerpt of this track is attached: listen to it and describe what you actually hear. The title and filename are withheld on purpose: judge genre, mood, instruments and character from the audio alone. Return exactly one JSON object matching outputShape, never an array. Use the attached audio for genres, subgenres, moods, instruments, character, movement and the caption, and prefer the supplied FFmpeg/ffprobe and Essentia measurements for tempo, key and loudness. Never infer content from the filename alone. Do not make rights, copyright, ownership, or approval claims. Prefer null or [] only when the audio genuinely does not support a value."
        : "Act as SoundVault's internal metadata assistant. Return exactly one JSON object matching outputShape, never an array. No audio is attached, so describe only what the supplied FFmpeg/ffprobe facts and Essentia music features support, and do not guess genres, moods or instruments from the filename. Do not make rights, copyright, ownership, or approval claims. Prefer null or [] when uncertain.",
      outputShape: Object.keys(geminiMetadataSchema.shape),
      // With audio attached the title and filename are deliberately withheld.
      // Leaving them in steered the model hard: a file named "...breaking news
      // urgent..." came back "urgent, tense, suspenseful", while the same audio
      // analysed blind was consistently "uplifting, hopeful, epic". The asset
      // role is structural rather than semantic, so it stays.
      source: input.hasAudio
        ? { assetRole: input.source.assetRole }
        : {
            displayTitle: input.source.displayTitle,
            originalFilename: input.source.originalFilename,
            assetRole: input.source.assetRole,
          },
      ffprobe: input.probe,
      ffmpegMeasurements: input.measurements,
      essentiaFeatures: input.features,
      // The fallback caption embeds the working title, so it is withheld for
      // the same reason.
      localFallback: input.hasAudio
        ? { ...input.fallback, transformerCaption: null }
        : input.fallback,
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
    /**
     * Bounded excerpt of the Master. Without it the model can only guess from
     * the filename and numeric features, which yields empty genres and moods.
     */
    audio?: AnalysisExcerpt;
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
  const prompt = buildPrompt({
    ...input,
    fallback,
    hasAudio: Boolean(input.audio),
  });
  const contents = input.audio
    ? [
        {
          role: "user" as const,
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: input.audio.mimeType,
                data: input.audio.bytes.toString("base64"),
              },
            },
          ],
        },
      ]
    : prompt;
  let lastError: AiAnalysisError | null = null;

  for (const model of geminiModels(config)) {
    try {
      const response = await withTimeout(
        client.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
        config.timeoutMs,
      );
      const text = extractText(response);
      const rawParsed = unwrapMetadataObject(JSON.parse(text));
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
          audioProvided: Boolean(input.audio),
          audioSeconds: input.audio?.durationSeconds ?? null,
          audioBytes: input.audio?.bytes.byteLength ?? null,
          audioBitrateKbps: input.audio?.bitrateKbps ?? null,
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
