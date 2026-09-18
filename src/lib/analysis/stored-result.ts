import "server-only";

import { z } from "zod";

import type { NormalizedAnalysisResult } from "@/types/processing";

/**
 * Rows in `analysis.*` hold JSON written by whichever version of the analyser
 * was deployed at the time, so a stored result is only ever a *past* shape of
 * `NormalizedAnalysisResult`. Reading one as the current type is a lie the
 * compiler cannot catch: a field added later is simply absent, and the first
 * `.length` or `.join` on it throws in a server component.
 *
 * Every field therefore carries a default here, so an old row reads as a
 * complete result with the newer fields empty rather than crashing the page.
 */
const storedArray = z
  .preprocess(
    (value) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [],
    z.array(z.string()),
  )
  .default([]);

const storedNumber = z.number().finite().nullable().catch(null).default(null);
const storedString = z.string().nullable().catch(null).default(null);

const storedAnalysisResultSchema = z.object({
  genres: storedArray,
  subgenres: storedArray,
  moods: storedArray,
  instruments: storedArray,
  bpm: storedNumber,
  bpmRangeAdjusted: storedNumber,
  key: storedString,
  timeSignature: storedString,
  energy: z
    .union([z.string(), z.number()])
    .nullable()
    .catch(null)
    .default(null),
  energyScore: storedNumber,
  energyDynamics: storedString,
  valence: storedNumber,
  arousal: storedNumber,
  vocalState: storedString,
  voiceTags: storedArray,
  voiceoverExists: z.boolean().nullable().catch(null).default(null),
  voiceoverDegree: storedNumber,
  character: storedArray,
  movement: storedArray,
  musicalEra: storedString,
  transformerCaption: storedString,
  freeGenreTags: storedArray,
  searchTags: storedArray,
  useCases: storedArray,
  segmentIntervalSeconds: storedNumber,
  segments: z
    .array(
      z.object({
        startSeconds: z.number().finite(),
        endSeconds: z.number().finite(),
        valence: z.number().finite().optional(),
        arousal: z.number().finite().optional(),
      }),
    )
    .catch([])
    .default([]),
});

/**
 * Reads a stored analysis result, filling anything the writing version did not
 * know about. A row that is absent or not an object reads as null, which the
 * UI already handles as "no AI suggestions yet".
 */
export function parseStoredAnalysisResult(
  value: unknown,
): NormalizedAnalysisResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return storedAnalysisResultSchema.parse(value);
}
