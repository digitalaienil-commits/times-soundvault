import { getDatabase } from "@/lib/database/database";
import { getApiUser, safeUploadError } from "@/lib/domain/uploads/api";
import { assertCanMutateUploadSubmission } from "@/lib/domain/uploads/authorization";
import {
  getUploadSessionAccess,
  storageReferenceForSession,
  updateUploadProgress,
} from "@/lib/domain/uploads/repository";
import { mapUploadSessionRow } from "@/lib/domain/uploads/mapper";
import { parseStorageConfig } from "@/lib/storage/config";
import { createStorageProvider } from "@/lib/storage/factory";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/uploads/[sessionId]/status">,
) {
  const user = await getApiUser();
  if (user instanceof Response) return user;
  try {
    const { sessionId } = await context.params;
    const database = getDatabase();
    const row = await getUploadSessionAccess(database, sessionId);
    if (!row)
      return Response.json(
        { error: "Upload Session was not found" },
        { status: 404 },
      );
    assertCanMutateUploadSubmission(user, row.owner_user_id);
    if (row.status === "completed" || row.status === "cancelled") {
      return Response.json({ session: mapUploadSessionRow(row) });
    }
    const config = parseStorageConfig();
    const status = await createStorageProvider().getUploadStatus(
      storageReferenceForSession(row, config),
    );
    if (status.expired) {
      await database.query(
        `UPDATE workflow.upload_session
         SET status = 'expired', last_error_code = 'SESSION_EXPIRED',
             last_error_message = 'Upload Session expired', row_version = row_version + 1
         WHERE id = $1 AND status <> 'completed'`,
        [sessionId],
      );
    } else if (status.uploadedByteSize !== Number(row.uploaded_byte_size)) {
      await updateUploadProgress(database, sessionId, status.uploadedByteSize);
    }
    const refreshed = await getUploadSessionAccess(database, sessionId);
    return Response.json({
      session: refreshed
        ? mapUploadSessionRow(refreshed)
        : mapUploadSessionRow(row),
    });
  } catch (error) {
    return safeUploadError(error);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/uploads/[sessionId]/status">,
) {
  const user = await getApiUser();
  if (user instanceof Response) return user;
  try {
    const { sessionId } = await context.params;
    const body = (await request.json()) as { action?: string };
    if (body.action !== "pause" && body.action !== "resume") {
      return Response.json(
        { error: "Upload action must be pause or resume" },
        { status: 400 },
      );
    }
    const database = getDatabase();
    const row = await getUploadSessionAccess(database, sessionId);
    if (!row)
      return Response.json(
        { error: "Upload Session was not found" },
        { status: 404 },
      );
    assertCanMutateUploadSubmission(user, row.owner_user_id);
    const target = body.action === "pause" ? "paused" : "uploading";
    const allowed =
      body.action === "pause" ? ["uploading"] : ["paused", "failed"];
    const result = await database.query(
      `UPDATE workflow.upload_session
       SET status = $2, row_version = row_version + 1
       WHERE id = $1 AND status = ANY($3::text[]) RETURNING *`,
      [sessionId, target, allowed],
    );
    if (!result.rows[0])
      return Response.json(
        { error: "Upload state changed before this action" },
        { status: 409 },
      );
    return Response.json({ session: mapUploadSessionRow(result.rows[0]) });
  } catch (error) {
    return safeUploadError(error);
  }
}
