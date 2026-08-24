import { z } from "zod";

import { COPYRIGHT_OBSERVATION_TYPES } from "@/types/copyright";

export const youtubeVideoIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{11}$/, "Enter an 11-character YouTube video ID");

export const observationInputSchema = z
  .object({
    copyrightCheckId: z.uuid(),
    batchItemId: z.uuid().nullable().optional(),
    observationType: z.enum(COPYRIGHT_OBSERVATION_TYPES),
    youtubeVideoId: youtubeVideoIdSchema.nullable().optional(),
    youtubeClaimId: z.string().trim().max(200).nullable().optional(),
    youtubeAssetId: z.string().trim().max(200).nullable().optional(),
    youtubeReferenceId: z.string().trim().max(200).nullable().optional(),
    claimantName: z.string().trim().max(200).nullable().optional(),
    claimStatus: z
      .enum(["active", "pending", "inactive", "unknown"])
      .nullable()
      .optional(),
    claimPolicy: z
      .enum(["monetize", "track", "block", "unknown"])
      .nullable()
      .optional(),
    matchStartMs: z.number().int().nonnegative().nullable().optional(),
    matchEndMs: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    observedAt: z.coerce.date(),
    strikeConfirmed: z.boolean().default(false),
  })
  .superRefine((input, context) => {
    if (
      input.matchStartMs != null &&
      input.matchEndMs != null &&
      input.matchEndMs < input.matchStartMs
    )
      context.addIssue({
        code: "custom",
        path: ["matchEndMs"],
        message: "Match end must not be earlier than match start",
      });
    if (input.observationType === "copyright_strike") {
      if (!input.strikeConfirmed)
        context.addIssue({
          code: "custom",
          path: ["strikeConfirmed"],
          message: "A copyright strike must be explicitly confirmed",
        });
      if (!input.notes)
        context.addIssue({
          code: "custom",
          path: ["notes"],
          message: "A copyright strike requires a note",
        });
    }
  });
