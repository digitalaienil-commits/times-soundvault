"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/current-user";
import {
  addReviewNote,
  assignReview,
  completeReview,
  releaseAssignedReview,
  reopenReadyReview,
  ReviewRepositoryError,
  saveReviewField,
  startReview,
  updateReviewChecklist,
  updateReviewTerm,
} from "@/lib/review/review";
import {
  reviewChecklistInputSchema,
  reviewFieldInputSchema,
  reviewNoteInputSchema,
  reviewTermInputSchema,
} from "@/lib/review/validation";

export interface ReviewActionState {
  error: string | null;
  saved: boolean;
}

function actionError(error: unknown): ReviewActionState {
  if (error instanceof ReviewRepositoryError || error instanceof z.ZodError) {
    return {
      error:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Review input is invalid.")
          : error.message,
      saved: false,
    };
  }
  return {
    error: "Review could not be saved. Try again or refresh the page.",
    saved: false,
  };
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function revalidateReview(formData: FormData) {
  const submissionId = z.uuid().parse(text(formData, "submissionId"));
  revalidatePath("/review");
  revalidatePath(`/review/${submissionId}`);
}

export async function startReviewAction(formData: FormData) {
  const user = await requirePermission("submission.review", "/review");
  const submissionId = z.uuid().parse(text(formData, "submissionId"));
  await startReview(submissionId, user.id);
  redirect(`/review/${submissionId}`);
}

export async function saveReviewFieldAction(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    const user = await requirePermission(
      "submission.metadataReview",
      "/review",
    );
    const parsed = reviewFieldInputSchema.parse(Object.fromEntries(formData));
    const submissionId = z.uuid().parse(text(formData, "submissionId"));
    await saveReviewField({
      ...parsed,
      submissionId,
      actor: user,
    });
    revalidatePath(`/review/${submissionId}`);
    return { error: null, saved: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveChecklistAction(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    const user = await requirePermission(
      "submission.metadataReview",
      "/review",
    );
    const parsed = reviewChecklistInputSchema.parse(
      Object.fromEntries(formData),
    );
    await updateReviewChecklist({
      reviewCaseId: parsed.reviewCaseId,
      code: parsed.code,
      status: parsed.status,
      note: parsed.note,
      expectedVersion: parsed.rowVersion,
      actor: user,
    });
    revalidateReview(formData);
    return { error: null, saved: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveReviewTermAction(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    const user = await requirePermission(
      "submission.metadataReview",
      "/review",
    );
    const parsed = reviewTermInputSchema.parse(Object.fromEntries(formData));
    await updateReviewTerm({
      reviewCaseId: parsed.reviewCaseId,
      termId: parsed.termId,
      sourceKind: parsed.sourceKind,
      decision: parsed.decision,
      reason: parsed.reason,
      expectedVersion: parsed.rowVersion,
      actor: user,
    });
    revalidateReview(formData);
    return { error: null, saved: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function addReviewNoteAction(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    const user = await requirePermission(
      "submission.metadataReview",
      "/review",
    );
    const parsed = reviewNoteInputSchema.parse(Object.fromEntries(formData));
    await addReviewNote({
      reviewCaseId: parsed.reviewCaseId,
      category: parsed.category,
      body: parsed.body,
      expectedVersion: parsed.rowVersion,
      actor: user,
    });
    revalidateReview(formData);
    return { error: null, saved: true };
  } catch (error) {
    return actionError(error);
  }
}

const caseActionSchema = z.object({
  reviewCaseId: z.uuid(),
  rowVersion: z.coerce.number().int().positive(),
});

export async function releaseReviewAction(formData: FormData) {
  const user = await requirePermission("submission.review", "/review");
  const parsed = caseActionSchema.parse(Object.fromEntries(formData));
  await releaseAssignedReview(parsed.reviewCaseId, parsed.rowVersion, user);
  redirect("/review");
}

export async function reassignReviewAction(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    const user = await requirePermission("submission.review", "/review");
    const parsed = caseActionSchema
      .extend({ assigneeUserId: z.string().min(1) })
      .parse(Object.fromEntries(formData));
    await assignReview(
      parsed.reviewCaseId,
      parsed.assigneeUserId,
      parsed.rowVersion,
      user,
    );
    revalidateReview(formData);
    return { error: null, saved: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function markReadyAction(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    const user = await requirePermission(
      "submission.metadataReview",
      "/review",
    );
    const parsed = caseActionSchema.parse(Object.fromEntries(formData));
    await completeReview(parsed.reviewCaseId, parsed.rowVersion, user);
    revalidateReview(formData);
    return { error: null, saved: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function reopenReviewAction(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    const user = await requirePermission(
      "submission.metadataReview",
      "/review",
    );
    const parsed = caseActionSchema.parse(Object.fromEntries(formData));
    await reopenReadyReview(parsed.reviewCaseId, parsed.rowVersion, user);
    revalidateReview(formData);
    return { error: null, saved: true };
  } catch (error) {
    return actionError(error);
  }
}
