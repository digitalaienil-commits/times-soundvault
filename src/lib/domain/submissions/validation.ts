import { z } from "zod";

import { ASSET_KINDS, VERSION_TYPES } from "@/types/domain/catalog";
import {
  REVISION_STATUSES,
  SUBMISSION_STATUSES,
} from "@/types/domain/submission";

const userIdSchema = z.string().trim().min(1).max(255);
const nullableUuidSchema = z.uuid().nullable().optional();

export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);
export const revisionStatusSchema = z.enum(REVISION_STATUSES);

export const createDraftSubmissionInputSchema = z.object({
  ownerUserId: userIdSchema,
  actorUserId: userIdSchema,
  title: z.string().trim().max(500).nullable().optional(),
  assetKind: z.enum(ASSET_KINDS).default("music"),
  parentTrackId: nullableUuidSchema,
  compositionId: nullableUuidSchema,
  versionType: z.enum(VERSION_TYPES).default("original"),
  versionLabel: z.string().trim().max(200).nullable().optional(),
  batchId: nullableUuidSchema,
});

export const createSubmissionRevisionInputSchema = z.object({
  submissionId: z.uuid(),
  submissionOwnerUserId: userIdSchema,
  actorUserId: userIdSchema,
  producerMetadata: z.record(z.string(), z.unknown()).default({}),
  embeddedMetadata: z.record(z.string(), z.unknown()).default({}),
  sourceNotes: z.string().trim().max(5000).nullable().optional(),
});
