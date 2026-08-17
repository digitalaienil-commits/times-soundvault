"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/current-user";
import {
  createTeamMember,
  updateTeamMemberRole,
  updateTeamMemberSuspension,
} from "@/lib/auth/team-access";
import { TeamAccessError } from "@/lib/auth/team-access-repository";
import { USER_ROLES } from "@/types/auth";

const addSchema = z.object({
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().max(120).optional(),
  role: z.enum(USER_ROLES),
});

const roleSchema = z.object({
  accessId: z.string().uuid(),
  role: z.enum(USER_ROLES),
  confirmed: z.literal("yes").optional(),
});

const statusSchema = z.object({
  accessId: z.string().uuid(),
  operation: z.enum(["suspend", "reactivate"]),
});

function resultUrl(kind: "notice" | "error", message: string): string {
  return `/team?${kind}=${encodeURIComponent(message)}`;
}

function safeMutationError(error: unknown): string {
  if (error instanceof TeamAccessError) {
    return error.message;
  }
  if (error instanceof z.ZodError) {
    return "Check the submitted values and try again.";
  }
  return "The team change could not be completed safely.";
}

export async function addTeamMemberAction(formData: FormData) {
  const actor = await requirePermission("team.manage", "/team");
  let destination: string;
  try {
    const input = addSchema.parse({
      email: formData.get("email"),
      displayName: formData.get("displayName") || undefined,
      role: formData.get("role"),
    });
    await createTeamMember({
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      actorUserId: actor.id,
    });
    destination = resultUrl(
      "notice",
      "Team member added. They can sign in using the approved company account.",
    );
  } catch (error) {
    destination = resultUrl("error", safeMutationError(error));
  }
  revalidatePath("/team");
  redirect(destination);
}

export async function changeTeamRoleAction(formData: FormData) {
  const actor = await requirePermission("team.manage", "/team");
  let destination: string;
  try {
    const input = roleSchema.parse({
      accessId: formData.get("accessId"),
      role: formData.get("role"),
      confirmed: formData.get("confirmed") || undefined,
    });
    await updateTeamMemberRole({
      accessId: input.accessId,
      role: input.role,
      actorUserId: actor.id,
      confirmed: input.confirmed === "yes",
    });
    destination = resultUrl(
      "notice",
      "Role changed. Existing sessions were revoked.",
    );
  } catch (error) {
    destination = resultUrl("error", safeMutationError(error));
  }
  revalidatePath("/team");
  redirect(destination);
}

export async function changeTeamStatusAction(formData: FormData) {
  const actor = await requirePermission("team.manage", "/team");
  let destination: string;
  try {
    const input = statusSchema.parse({
      accessId: formData.get("accessId"),
      operation: formData.get("operation"),
    });
    await updateTeamMemberSuspension({
      accessId: input.accessId,
      suspended: input.operation === "suspend",
      actorUserId: actor.id,
    });
    destination = resultUrl(
      "notice",
      input.operation === "suspend"
        ? "Access suspended. Existing sessions were revoked."
        : "Access reactivated.",
    );
  } catch (error) {
    destination = resultUrl("error", safeMutationError(error));
  }
  revalidatePath("/team");
  redirect(destination);
}
