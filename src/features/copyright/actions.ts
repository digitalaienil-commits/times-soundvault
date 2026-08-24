"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/current-user";
import { parseCopyrightConfig } from "@/lib/copyright/config";
import type { EligibilityChecklist } from "@/lib/copyright/eligibility";
import { ELIGIBILITY_QUESTIONS } from "@/lib/copyright/eligibility";
import {
  createCopyrightBatch,
  markRemainingBatchItemsNoClaim,
  recordBatchVideoId,
  recordCopyrightObservation,
  recordEligibilityReview,
  recordYouTubeReferenceLink,
  reopenCopyrightCheck,
} from "@/lib/copyright/repository";
import { getDatabase } from "@/lib/database/database";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalMilliseconds(formData: FormData, name: string): number | null {
  const value = field(formData, name);
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new Error("Match timestamps must be non-negative numbers");
  return Math.round(seconds * 1000);
}

export async function createCopyrightBatchAction(formData: FormData) {
  const user = await requirePermission("copyright.prepare", "/copyright");
  const config = parseCopyrightConfig();
  const checkIds = formData
    .getAll("checkId")
    .filter((value): value is string => typeof value === "string");
  const batchId = await createCopyrightBatch(getDatabase(), {
    checkIds,
    actorUserId: user.id,
    maxTracks: config.maxTracks,
    maxDurationMs: config.maxDurationSeconds * 1000,
    gapMs: config.gapSeconds * 1000,
    retentionDays: config.retentionDays,
  });
  redirect(`/copyright/batches/${batchId}`);
}

export async function recordBatchVideoAction(formData: FormData) {
  const user = await requirePermission("copyright.record", "/copyright");
  const batchId = field(formData, "batchId");
  await recordBatchVideoId(getDatabase(), {
    batchId,
    videoId: field(formData, "youtubeVideoId"),
    actorUserId: user.id,
  });
  revalidatePath(`/copyright/batches/${batchId}`);
  revalidatePath("/copyright");
}

export async function recordObservationAction(formData: FormData) {
  const user = await requirePermission("copyright.record", "/copyright");
  const batchId = field(formData, "batchId");
  await recordCopyrightObservation(
    getDatabase(),
    {
      copyrightCheckId: field(formData, "copyrightCheckId"),
      batchItemId: field(formData, "batchItemId") || null,
      observationType: field(formData, "observationType"),
      youtubeVideoId: field(formData, "youtubeVideoId") || null,
      youtubeClaimId: field(formData, "youtubeClaimId") || null,
      youtubeAssetId: field(formData, "youtubeAssetId") || null,
      youtubeReferenceId: field(formData, "youtubeReferenceId") || null,
      claimantName: field(formData, "claimantName") || null,
      claimStatus: field(formData, "claimStatus") || null,
      claimPolicy: field(formData, "claimPolicy") || null,
      matchStartMs: optionalMilliseconds(formData, "matchStartSeconds"),
      matchEndMs: optionalMilliseconds(formData, "matchEndSeconds"),
      notes: field(formData, "notes") || null,
      observedAt: new Date(),
      strikeConfirmed: formData.get("strikeConfirmed") === "yes",
    },
    user.id,
  );
  revalidatePath(`/copyright/batches/${batchId}`);
  revalidatePath("/copyright");
}

export async function markRemainingNoClaimAction(formData: FormData) {
  const user = await requirePermission("copyright.record", "/copyright");
  const batchId = field(formData, "batchId");
  await markRemainingBatchItemsNoClaim(getDatabase(), {
    batchId,
    actorUserId: user.id,
    confirmed: formData.get("noClaimConfirmed") === "yes",
  });
  revalidatePath(`/copyright/batches/${batchId}`);
  revalidatePath("/copyright");
}

export async function reviewEligibilityAction(formData: FormData) {
  const user = await requirePermission("copyright.resolve", "/copyright");
  const checklist = Object.fromEntries(
    ELIGIBILITY_QUESTIONS.map((question) => [
      question,
      ["yes", "no", "unknown"].includes(field(formData, question))
        ? field(formData, question)
        : "unknown",
    ]),
  ) as EligibilityChecklist;
  await recordEligibilityReview(getDatabase(), {
    copyrightCheckId: field(formData, "copyrightCheckId"),
    checklist,
    note: field(formData, "note") || null,
    actorUserId: user.id,
  });
  revalidatePath("/copyright");
}

export async function reopenCopyrightCheckAction(formData: FormData) {
  const user = await requirePermission("copyright.resolve", "/copyright");
  if (user.role !== "admin")
    throw new Error("Only an Admin can reopen a completed check");
  await reopenCopyrightCheck(getDatabase(), {
    checkId: field(formData, "copyrightCheckId"),
    actorUserId: user.id,
    reason: field(formData, "reason"),
  });
  revalidatePath("/copyright");
}

export async function recordReferenceLinkAction(formData: FormData) {
  const user = await requirePermission("copyright.resolve", "/copyright");
  if (user.role !== "admin")
    throw new Error("Only an Admin can record an existing reference link");
  await recordYouTubeReferenceLink(getDatabase(), {
    checkId: field(formData, "copyrightCheckId"),
    referenceId: field(formData, "referenceId"),
    assetId: field(formData, "assetId") || null,
    actorUserId: user.id,
  });
  revalidatePath("/copyright");
}
