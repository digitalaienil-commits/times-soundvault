import { getDatabase } from "@/lib/database/database";
import {
  getApiUser,
  parseContentRange,
  safeUploadError,
} from "@/lib/domain/uploads/api";
import { assertCanMutateUploadSubmission } from "@/lib/domain/uploads/authorization";
import {
  getUploadSessionAccess,
  storageReferenceForSession,
  updateUploadProgress,
} from "@/lib/domain/uploads/repository";
import { parseStorageConfig } from "@/lib/storage/config";
import { createStorageProvider } from "@/lib/storage/factory";

export async function PUT(
  request: Request,
  context: RouteContext<"/api/uploads/[sessionId]/chunk">,
) {
  const user = await getApiUser();
  if (user instanceof Response) return user;
  const range = parseContentRange(request.headers.get("content-range"));
  if (!range || !request.body) {
    return Response.json(
      { error: "A valid Content-Range and chunk body are required" },
      { status: 400 },
    );
  }
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
    if (
      row.status === "cancelled" ||
      row.status === "expired" ||
      row.status === "completed"
    ) {
      return Response.json(
        { error: `Upload is ${row.status}` },
        { status: 409 },
      );
    }
    if (range.total !== Number(row.expected_byte_size)) {
      return Response.json(
        { error: "Content-Range total does not match the registered file" },
        { status: 416 },
      );
    }
    const config = parseStorageConfig();
    const provider = createStorageProvider();
    const reference = storageReferenceForSession(row, config);
    const status = await provider.writeChunk({
      reference,
      body: request.body,
      ...range,
    });
    const session = await updateUploadProgress(
      database,
      sessionId,
      status.uploadedByteSize,
      reference.itemId,
    );
    return Response.json({ session, complete: status.completed });
  } catch (error) {
    return safeUploadError(error);
  }
}
