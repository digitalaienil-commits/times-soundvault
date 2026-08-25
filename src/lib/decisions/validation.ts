import { z } from "zod";

import { CHANGE_REQUEST_CATEGORIES } from "@/types/decisions";

const changeItemSchema = z.object({
  category: z.enum(CHANGE_REQUEST_CATEGORIES),
  instruction: z.string().trim().min(1).max(2_000),
});

export const approveDecisionSchema = z.object({
  reviewCaseId: z.uuid(),
  reviewVersion: z.coerce.number().int().positive(),
  acknowledgeAttention: z.coerce.boolean().default(false),
  attentionNote: z.string().trim().max(2_000).optional(),
});

export const requestChangesSchema = z.object({
  reviewCaseId: z.uuid(),
  reviewVersion: z.coerce.number().int().positive(),
  producerSummary: z.string().trim().min(1).max(3_000),
  items: z.array(changeItemSchema).min(1).max(25),
});

export const recommendRejectSchema = z.object({
  reviewCaseId: z.uuid(),
  reviewVersion: z.coerce.number().int().positive(),
  reasonCategory: z.string().trim().min(1).max(100),
  internalReason: z.string().trim().min(1).max(5_000),
});

export const confirmRejectSchema = z.object({
  recommendationId: z.uuid(),
  producerReason: z.string().trim().min(1).max(3_000),
  adminNote: z.string().trim().max(5_000).optional(),
});

export const returnForChangesSchema = z.object({
  recommendationId: z.uuid(),
  producerSummary: z.string().trim().min(1).max(3_000),
  adminNote: z.string().trim().max(5_000).optional(),
  items: z.array(changeItemSchema).min(1).max(25),
});

export const publicationActionSchema = z.object({
  submissionId: z.uuid(),
  reason: z.string().trim().min(1).max(2_000).optional(),
});

export const withdrawalActionSchema = z.object({
  submissionId: z.uuid(),
  reason: z.string().trim().min(1).max(2_000),
  confirmed: z.literal(true),
});

export const bulkActionSchema = z
  .array(
    z.object({
      id: z.uuid(),
      version: z.number().int().positive().optional(),
    }),
  )
  .min(1)
  .max(25);
