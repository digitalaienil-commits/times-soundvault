import { z } from "zod";

import { METADATA_SOURCE_KINDS } from "@/types/domain/metadata";
import {
  REVIEW_CHECK_CODES,
  REVIEW_CHECK_STATUSES,
  REVIEW_FIELD_NAMES,
} from "@/types/review";

export const reviewQueueFiltersSchema = z.object({
  assignment: z.enum(["unassigned", "mine", "all"]).default("all"),
  state: z
    .enum(["all", "ready_for_review", "in_review", "ready_for_decision"])
    .default("all"),
  technical: z.enum(["all", "clean", "warnings"]).default("all"),
  ai: z
    .enum(["all", "complete", "partial", "not_configured", "failed"])
    .default("all"),
  copyright: z.enum(["all", "clear", "attention", "pending"]).default("all"),
  rights: z.enum(["all", "reviewed", "attention"]).default("all"),
  search: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().positive().max(10_000).default(1),
});

export const reviewFieldInputSchema = z.object({
  reviewCaseId: z.uuid(),
  fieldName: z.enum(REVIEW_FIELD_NAMES),
  sourceKind: z.enum(METADATA_SOURCE_KINDS),
  customValue: z.string().max(5_000).optional(),
  rowVersion: z.coerce.number().int().positive(),
});

export const reviewChecklistInputSchema = z
  .object({
    reviewCaseId: z.uuid(),
    code: z.enum(REVIEW_CHECK_CODES),
    status: z.enum(REVIEW_CHECK_STATUSES),
    note: z.string().trim().max(2_000).optional(),
    rowVersion: z.coerce.number().int().positive(),
  })
  .refine(({ status, note }) => status !== "attention" || Boolean(note), {
    message: "Add a note when a checklist item needs attention.",
  });

export const reviewTermInputSchema = z.object({
  reviewCaseId: z.uuid(),
  termId: z.uuid(),
  sourceKind: z.enum(METADATA_SOURCE_KINDS),
  decision: z.enum(["selected", "rejected"]),
  reason: z.string().trim().max(1_000).optional(),
  rowVersion: z.coerce.number().int().positive(),
});

export const reviewNoteInputSchema = z.object({
  reviewCaseId: z.uuid(),
  category: z.enum(["general", "audio", "metadata", "rights", "copyright"]),
  body: z.string().trim().min(1).max(5_000),
  rowVersion: z.coerce.number().int().positive(),
});

const scalarSchemas = {
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(3_000).nullable(),
  bpm: z.coerce.number().positive().max(400).nullable(),
  keyTonic: z.string().trim().max(30).nullable(),
  keyMode: z.string().trim().max(30).nullable(),
  timeSignature: z
    .string()
    .trim()
    .regex(/^\d{1,2}\/\d{1,2}$/)
    .nullable(),
  energyScore: z.coerce.number().min(0).max(1).nullable(),
  valence: z.coerce.number().min(0).max(1).nullable(),
  arousal: z.coerce.number().min(0).max(1).nullable(),
  vocalState: z.enum(["unknown", "instrumental", "vocal", "mixed"]),
  languageCode: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/)
    .nullable(),
  era: z.string().trim().max(100).nullable(),
  descriptionCaption: z.string().trim().max(1_000).nullable(),
  format: z
    .enum([
      "background_bed",
      "stinger",
      "bumper",
      "intro",
      "outro",
      "transition",
      "theme",
      "full_track",
    ])
    .nullable(),
  underDialogue: z.enum(["yes", "no", "unknown"]).nullable(),
  loopable: z.enum(["yes", "no", "unknown"]).nullable(),
  endingType: z
    .enum(["clean_stop", "final_hit", "fade", "open", "unknown"])
    .nullable(),
} as const;

export function parseReviewFieldValue(
  fieldName: keyof typeof scalarSchemas,
  value: unknown,
) {
  return scalarSchemas[fieldName].parse(value === "" ? null : value);
}
