import type { CurrentUser } from "@/types/auth";

export function canReadUploadSubmission(
  user: Pick<CurrentUser, "id" | "role">,
  ownerUserId: string,
): boolean {
  return (
    user.role === "admin" ||
    user.role === "coordinator" ||
    (user.role === "music_producer" && user.id === ownerUserId)
  );
}

export function canMutateUploadSubmission(
  user: Pick<CurrentUser, "id" | "role">,
  ownerUserId: string,
): boolean {
  return (
    user.role === "admin" ||
    ((user.role === "music_producer" || user.role === "coordinator") &&
      user.id === ownerUserId)
  );
}

export function assertCanMutateUploadSubmission(
  user: Pick<CurrentUser, "id" | "role">,
  ownerUserId: string,
): void {
  if (!canMutateUploadSubmission(user, ownerUserId)) {
    throw new UploadAuthorizationError();
  }
}

export class UploadAuthorizationError extends Error {
  readonly code = "UPLOAD_FORBIDDEN";
  constructor() {
    super("You do not have permission to change this upload");
    this.name = "UploadAuthorizationError";
  }
}
