"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { DemandActionState } from "../action-state";

import { requirePermission } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/database/database";
import {
  acceptResponse,
  addDemandReference,
  createDemand,
  declineResponse,
  DemandRepositoryError,
  linkExistingSubmission,
  proposeCatalogTrack,
  removeDemandReference,
  restoreResponse,
  shortlistResponse,
  submitOrRefreshResponse,
  transitionDemand,
  unacceptResponse,
  updateDemand,
  withdrawResponse,
} from "@/lib/demands/repository";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function optional(formData: FormData, key: string) {
  return text(formData, key) || null;
}
function numberOrNull(formData: FormData, key: string, multiplier = 1) {
  const value = text(formData, key);
  return value ? Number(value) * multiplier : null;
}
function booleanOrNull(formData: FormData, key: string) {
  const value = text(formData, key);
  return value === "yes" ? true : value === "no" ? false : null;
}
function ids(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter(
      (value): value is string => typeof value === "string" && Boolean(value),
    );
}

function demandInput(formData: FormData) {
  return {
    title: text(formData, "title"),
    requesterName: optional(formData, "requesterName"),
    requestingTeam: optional(formData, "requestingTeam"),
    projectContext: text(formData, "projectContext"),
    brief: text(formData, "brief"),
    creativeNotes: optional(formData, "creativeNotes"),
    avoidNotes: optional(formData, "avoidNotes"),
    priority: text(formData, "priority"),
    assetKind: text(formData, "assetKind"),
    targetTrackCount: text(formData, "targetTrackCount"),
    responseDeadlineOn: text(formData, "responseDeadlineOn"),
    neededByOn: text(formData, "neededByOn"),
    bpmMin: numberOrNull(formData, "bpmMin"),
    bpmMax: numberOrNull(formData, "bpmMax"),
    durationMinMs: numberOrNull(formData, "durationMinSeconds", 1000),
    durationMaxMs: numberOrNull(formData, "durationMaxSeconds", 1000),
    vocalState: optional(formData, "vocalState"),
    underDialogue: booleanOrNull(formData, "underDialogue"),
    loopable: booleanOrNull(formData, "loopable"),
    stemsRequired: formData.has("stemsRequired"),
    endingType: optional(formData, "endingType"),
    ownerUserId: text(formData, "ownerUserId"),
    termRequirements: [
      ...ids(formData, "requiredTermIds").map((termId) => ({
        termId,
        importance: "required" as const,
      })),
      ...ids(formData, "preferredTermIds").map((termId) => ({
        termId,
        importance: "preferred" as const,
      })),
    ],
    assigneeUserIds: ids(formData, "assigneeUserIds"),
    referenceTrackIds: ids(formData, "referenceTrackIds"),
  };
}

function safeError(error: unknown): DemandActionState {
  if (error instanceof DemandRepositoryError)
    return { error: error.message, blockers: error.blockers, saved: false };
  if (error instanceof z.ZodError)
    return {
      error: error.issues[0]?.message ?? "Demand details are invalid.",
      blockers: [],
      saved: false,
    };
  return {
    error: "The Demand action could not be completed. Refresh and try again.",
    blockers: [],
    saved: false,
  };
}

function revalidateDemand(demandId: string) {
  revalidatePath("/demands");
  revalidatePath(`/demands/${demandId}`);
  revalidatePath(`/demands/${demandId}/edit`);
  revalidatePath(`/demands/${demandId}/find`);
  revalidatePath("/dashboard");
}

export async function createDemandAction(
  _state: DemandActionState,
  formData: FormData,
): Promise<DemandActionState> {
  let destination = "";
  try {
    const user = await requirePermission("demand.create", "/demands/new");
    const id = await createDemand(getDatabase(), user, {
      ...demandInput(formData),
      intent: text(formData, "intent"),
    });
    revalidateDemand(id);
    destination = `/demands/${id}`;
  } catch (error) {
    return safeError(error);
  }
  redirect(destination);
}

export async function updateDemandAction(
  _state: DemandActionState,
  formData: FormData,
): Promise<DemandActionState> {
  let destination = "";
  try {
    const user = await requirePermission("demand.manage", "/demands");
    const id = await updateDemand(getDatabase(), user, {
      ...demandInput(formData),
      demandId: text(formData, "demandId"),
      rowVersion: text(formData, "rowVersion"),
    });
    revalidateDemand(id);
    destination = `/demands/${id}`;
  } catch (error) {
    return safeError(error);
  }
  redirect(destination);
}

export async function transitionDemandAction(
  _state: DemandActionState,
  formData: FormData,
): Promise<DemandActionState> {
  try {
    const user = await requirePermission("demand.manage", "/demands");
    const demandId = text(formData, "demandId");
    await transitionDemand(getDatabase(), user, {
      demandId,
      rowVersion: text(formData, "rowVersion"),
      nextStatus: text(formData, "nextStatus"),
      reason: optional(formData, "reason") ?? undefined,
    });
    revalidateDemand(demandId);
    return { error: null, blockers: [], saved: true };
  } catch (error) {
    return safeError(error);
  }
}

export async function proposeCatalogTrackAction(
  _state: DemandActionState,
  formData: FormData,
): Promise<DemandActionState> {
  try {
    const user = await requirePermission("demand.respond", "/demands");
    const demandId = text(formData, "demandId");
    await proposeCatalogTrack(getDatabase(), user, {
      demandId,
      trackId: text(formData, "trackId"),
      pitchNote: optional(formData, "pitchNote") ?? undefined,
    });
    revalidateDemand(demandId);
    return { error: null, blockers: [], saved: true };
  } catch (error) {
    return safeError(error);
  }
}

export async function linkExistingSubmissionAction(
  _state: DemandActionState,
  formData: FormData,
): Promise<DemandActionState> {
  try {
    const user = await requirePermission("demand.respond", "/demands");
    const demandId = text(formData, "demandId");
    await linkExistingSubmission(getDatabase(), user, {
      demandId,
      submissionId: text(formData, "submissionId"),
    });
    revalidateDemand(demandId);
    return { error: null, blockers: [], saved: true };
  } catch (error) {
    return safeError(error);
  }
}

async function referenceAction(
  formData: FormData,
  operation: typeof addDemandReference,
) {
  const user = await requirePermission("demand.manage", "/demands");
  const demandId = text(formData, "demandId");
  await operation(getDatabase(), user, {
    demandId,
    trackId: text(formData, "trackId"),
    rowVersion: text(formData, "rowVersion"),
  });
  revalidateDemand(demandId);
  return { error: null, blockers: [], saved: true } satisfies DemandActionState;
}

function makeReferenceAction(operation: typeof addDemandReference) {
  return async (
    _state: DemandActionState,
    formData: FormData,
  ): Promise<DemandActionState> => {
    try {
      return await referenceAction(formData, operation);
    } catch (error) {
      return safeError(error);
    }
  };
}

export const addDemandReferenceAction = makeReferenceAction(addDemandReference);
export const removeDemandReferenceAction = makeReferenceAction(
  removeDemandReference,
);

async function responseAction(
  formData: FormData,
  operation: typeof shortlistResponse,
  permission: "demand.respond" | "demand.manage",
) {
  const user = await requirePermission(permission, "/demands");
  const demandId = text(formData, "demandId");
  await operation(getDatabase(), user, {
    demandId,
    responseId: text(formData, "responseId"),
    rowVersion: text(formData, "rowVersion"),
    reason: optional(formData, "reason") ?? undefined,
  });
  revalidateDemand(demandId);
  return { error: null, blockers: [], saved: true } satisfies DemandActionState;
}

function makeResponseAction(
  operation: typeof shortlistResponse,
  permission: "demand.respond" | "demand.manage",
) {
  return async (
    _state: DemandActionState,
    formData: FormData,
  ): Promise<DemandActionState> => {
    try {
      return await responseAction(formData, operation, permission);
    } catch (error) {
      return safeError(error);
    }
  };
}

export const shortlistResponseAction = makeResponseAction(
  shortlistResponse,
  "demand.manage",
);
export const acceptResponseAction = makeResponseAction(
  acceptResponse,
  "demand.manage",
);
export const declineResponseAction = makeResponseAction(
  declineResponse,
  "demand.manage",
);
export const restoreResponseAction = makeResponseAction(
  restoreResponse,
  "demand.manage",
);
export const unacceptResponseAction = makeResponseAction(
  unacceptResponse,
  "demand.manage",
);
export const withdrawResponseAction = makeResponseAction(
  withdrawResponse,
  "demand.respond",
);
export const submitOrRefreshResponseAction = makeResponseAction(
  submitOrRefreshResponse,
  "demand.respond",
);
