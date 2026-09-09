import { getDatabase } from "@/lib/database/database";
import { getApiUser, safeUploadError } from "@/lib/domain/uploads/api";
import { createUploadDraftBatch } from "@/lib/domain/uploads/repository";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/http/rate-limit";
import { readJsonBody } from "@/lib/http/request-body";
import { parseStorageConfig } from "@/lib/storage/config";
import { createStorageProvider } from "@/lib/storage/factory";

export const runtime = "nodejs";

/**
 * A batch manifest describes at most 25 Tracks with 32 Stems each. This is
 * generous for that shape and still bounded, so a draft request can never
 * stream an unbounded body into memory.
 */
const BATCH_MANIFEST_LIMIT_BYTES = 512 * 1024;

export async function POST(request: Request) {
  const user = await getApiUser();
  if (user instanceof Response) return user;

  const body = await readJsonBody(request, BATCH_MANIFEST_LIMIT_BYTES);
  if (body.kind === "too-large") {
    return Response.json(
      { error: "Upload details are too large" },
      { status: 413 },
    );
  }
  if (body.kind === "invalid") {
    return Response.json(
      { error: "Upload details are invalid" },
      { status: 400 },
    );
  }

  const limit = await consumeRateLimit(RATE_LIMITS.uploadSession, user.id);
  if (!limit.allowed) {
    const response = Response.json(
      { error: "Too many upload requests. Please wait and try again." },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return response;
  }

  try {
    const config = parseStorageConfig();
    const created = await createUploadDraftBatch(
      getDatabase(),
      user,
      body.value,
      config,
      createStorageProvider(),
    );
    return Response.json(created, { status: 201 });
  } catch (error) {
    return safeUploadError(error);
  }
}
