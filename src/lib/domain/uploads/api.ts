import "server-only";

import { getAuthState } from "@/lib/auth/current-user";
import type { CurrentUser } from "@/types/auth";

import { UploadAuthorizationError } from "./authorization";
import { UploadRepositoryError } from "./repository";

export async function getApiUser(): Promise<CurrentUser | Response> {
  const state = await getAuthState();
  if (state.kind !== "authenticated") {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return state.user;
}

export function safeUploadError(error: unknown): Response {
  if (
    error instanceof UploadAuthorizationError ||
    (error instanceof UploadRepositoryError &&
      error.code === "UPLOAD_FORBIDDEN")
  ) {
    return Response.json({ error: "Upload access is denied" }, { status: 403 });
  }
  if (error instanceof UploadRepositoryError) {
    const status = error.code === "UPLOAD_NOT_FOUND" ? 404 : 409;
    return Response.json(
      { error: error.message, code: error.code },
      { status },
    );
  }
  if (error instanceof Error && error.name === "ZodError") {
    return Response.json(
      { error: "Upload details are invalid" },
      { status: 400 },
    );
  }
  return Response.json(
    { error: "The upload operation could not be completed" },
    { status: 500 },
  );
}

export function parseContentRange(value: string | null): {
  start: number;
  end: number;
  total: number;
} | null {
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (
    ![start, end, total].every(Number.isSafeInteger) ||
    start < 0 ||
    end < start ||
    total <= end
  ) {
    return null;
  }
  return { start, end, total };
}
