"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/current-user";
import {
  approveSubmissionReview,
  approveSubmissionReviews,
  confirmSubmissionRejection,
  DecisionRepositoryError,
  publishSubmissionTrack,
  publishSubmissionTracks,
  recommendSubmissionRejection,
  requestSubmissionChanges,
  returnSubmissionForChanges,
  withdrawSubmissionTrack,
} from "@/lib/decisions/decisions";
import {
  approveDecisionSchema,
  bulkActionSchema,
  confirmRejectSchema,
  publicationActionSchema,
  recommendRejectSchema,
  requestChangesSchema,
  returnForChangesSchema,
  withdrawalActionSchema,
} from "@/lib/decisions/validation";

export interface DecisionActionState {
  error: string | null;
  blockers: string[];
  saved: boolean;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function actionError(error: unknown): DecisionActionState {
  if (error instanceof DecisionRepositoryError) {
    return { error: error.message, blockers: error.blockers, saved: false };
  }
  if (error instanceof z.ZodError) {
    return {
      error: error.issues[0]?.message ?? "Decision input is invalid.",
      blockers: [],
      saved: false,
    };
  }
  return {
    error: "The action could not be completed. Refresh and try again.",
    blockers: [],
    saved: false,
  };
}

function changeItems(formData: FormData) {
  const categories = formData.getAll("itemCategory");
  const instructions = formData.getAll("itemInstruction");
  return instructions.map((instruction, index) => ({
    category: typeof categories[index] === "string" ? categories[index] : "",
    instruction: typeof instruction === "string" ? instruction : "",
  }));
}

function revalidateDecision(submissionId: string) {
  revalidatePath("/review");
  revalidatePath(`/review/${submissionId}`);
  revalidatePath(`/submissions/${submissionId}`);
  revalidatePath("/my-uploads");
  revalidatePath("/library");
}

export async function approveDecisionAction(
  _state: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  let destination = "";
  try {
    const actor = await requirePermission("submission.approve", "/review");
    const parsed = approveDecisionSchema.parse({
      reviewCaseId: text(formData, "reviewCaseId"),
      reviewVersion: text(formData, "reviewVersion"),
      acknowledgeAttention: formData.has("acknowledgeAttention"),
      attentionNote: text(formData, "attentionNote") || undefined,
    });
    const result = await approveSubmissionReview({ ...parsed, actor });
    revalidateDecision(result.submissionId);
    destination = `/submissions/${result.submissionId}`;
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function requestChangesDecisionAction(
  _state: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  let destination = "";
  try {
    const actor = await requirePermission(
      "submission.requestChanges",
      "/review",
    );
    const parsed = requestChangesSchema.parse({
      reviewCaseId: text(formData, "reviewCaseId"),
      reviewVersion: text(formData, "reviewVersion"),
      producerSummary: text(formData, "producerSummary"),
      items: changeItems(formData),
    });
    const result = await requestSubmissionChanges({ ...parsed, actor });
    revalidateDecision(result.submissionId);
    destination = `/submissions/${result.submissionId}`;
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function recommendRejectDecisionAction(
  _state: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  let destination = "";
  try {
    const actor = await requirePermission(
      "submission.recommendReject",
      "/review",
    );
    const parsed = recommendRejectSchema.parse({
      reviewCaseId: text(formData, "reviewCaseId"),
      reviewVersion: text(formData, "reviewVersion"),
      reasonCategory: text(formData, "reasonCategory"),
      internalReason: text(formData, "internalReason"),
    });
    const result = await recommendSubmissionRejection({ ...parsed, actor });
    revalidateDecision(result.submissionId);
    destination = `/submissions/${result.submissionId}`;
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function confirmRejectDecisionAction(
  _state: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  let destination = "";
  try {
    const actor = await requirePermission(
      "submission.confirmReject",
      "/my-uploads",
    );
    const parsed = confirmRejectSchema.parse(Object.fromEntries(formData));
    const result = await confirmSubmissionRejection({ ...parsed, actor });
    revalidateDecision(result.submissionId);
    destination = `/submissions/${result.submissionId}`;
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function returnForChangesDecisionAction(
  _state: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  let destination = "";
  try {
    const actor = await requirePermission(
      "submission.confirmReject",
      "/my-uploads",
    );
    const parsed = returnForChangesSchema.parse({
      recommendationId: text(formData, "recommendationId"),
      producerSummary: text(formData, "producerSummary"),
      adminNote: text(formData, "adminNote") || undefined,
      items: changeItems(formData),
    });
    const result = await returnSubmissionForChanges({ ...parsed, actor });
    revalidateDecision(result.submissionId);
    destination = `/submissions/${result.submissionId}`;
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function publishDecisionAction(
  _state: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  try {
    const actor = await requirePermission("submission.publish", "/my-uploads");
    const parsed = publicationActionSchema.parse(Object.fromEntries(formData));
    await publishSubmissionTrack({ ...parsed, actor });
    revalidateDecision(parsed.submissionId);
    return { error: null, blockers: [], saved: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function withdrawDecisionAction(
  _state: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  try {
    const actor = await requirePermission(
      "submission.unpublish",
      "/my-uploads",
    );
    const parsed = withdrawalActionSchema.parse({
      submissionId: text(formData, "submissionId"),
      reason: text(formData, "reason"),
      confirmed: formData.has("confirmed"),
    });
    await withdrawSubmissionTrack({ ...parsed, actor });
    revalidateDecision(parsed.submissionId);
    return { error: null, blockers: [], saved: true };
  } catch (error) {
    return actionError(error);
  }
}

function bulkValues(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => {
    const [id, version] = String(value).split(":", 2);
    return { id, version: version ? Number(version) : undefined };
  });
}

export async function bulkApproveAction(
  _state: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  try {
    const actor = await requirePermission("submission.bulkApprove", "/review");
    const parsed = bulkActionSchema.parse(bulkValues(formData, "selected"));
    await approveSubmissionReviews({
      items: parsed.map((item) => ({ id: item.id, version: item.version! })),
      actor,
    });
    revalidatePath("/review");
    revalidatePath("/my-uploads");
    return { error: null, blockers: [], saved: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkPublishAction(
  _state: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  try {
    const actor = await requirePermission("submission.publish", "/review");
    const parsed = bulkActionSchema.parse(bulkValues(formData, "selected"));
    await publishSubmissionTracks({
      submissionIds: parsed.map((item) => item.id),
      actor,
    });
    revalidatePath("/review");
    revalidatePath("/library");
    return { error: null, blockers: [], saved: true };
  } catch (error) {
    return actionError(error);
  }
}
