import { z } from "zod";

import {
  ASSET_KINDS,
  PUBLICATION_STATUSES,
  VERSION_TYPES,
} from "@/types/domain/catalog";
import {
  COPYRIGHT_STATUSES,
  ENDING_TYPES,
  METADATA_ANALYSIS_STATUSES,
  VOCAL_STATES,
} from "@/types/domain/metadata";

export const assetKindSchema = z.enum(ASSET_KINDS);
export const versionTypeSchema = z.enum(VERSION_TYPES);
export const publicationStatusSchema = z.enum(PUBLICATION_STATUSES);
export const vocalStateSchema = z.enum(VOCAL_STATES);
export const endingTypeSchema = z.enum(ENDING_TYPES);
export const metadataAnalysisStatusSchema = z.enum(METADATA_ANALYSIS_STATUSES);
export const copyrightStatusSchema = z.enum(COPYRIGHT_STATUSES);

export const canonicalMetadataInputSchema = z.object({
  bpm: z.number().positive().max(400).nullable().optional(),
  energyScore: z.number().min(0).max(1).nullable().optional(),
  valence: z.number().min(0).max(1).nullable().optional(),
  arousal: z.number().min(0).max(1).nullable().optional(),
  vocalState: vocalStateSchema.optional(),
  underDialogue: z.boolean().nullable().optional(),
  loopable: z.boolean().nullable().optional(),
  endingType: endingTypeSchema.nullable().optional(),
});

export function normalizeIsrc(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

export function isValidNormalizedIsrc(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(value);
}

export function parseIsrc(value: string): string {
  const normalized = normalizeIsrc(value);
  if (!isValidNormalizedIsrc(normalized)) {
    throw new Error("ISRC must contain a valid 12-character recording code");
  }
  return normalized;
}

export function normalizeIswc(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s.-]+/g, "");
  if (!/^T[0-9]{10}$/.test(normalized)) {
    throw new Error("ISWC must contain T followed by 10 digits");
  }
  return normalized;
}

export function normalizeExternalIdentifier(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Identifier value cannot be empty");
  }
  return normalized;
}

export function normalizeStemType(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) {
    throw new Error("Stem type must contain letters or numbers");
  }
  return normalized;
}
