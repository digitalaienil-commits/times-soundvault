import { getDatabase } from "@/lib/database/database";
import { getApiUser, safeUploadError } from "@/lib/domain/uploads/api";
import { updateDraftProducerMetadata } from "@/lib/domain/uploads/repository";
import { readJsonBody } from "@/lib/http/request-body";

/** Producer draft metadata is a small structured record, never a file. */
const METADATA_LIMIT_BYTES = 128 * 1024;

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/submissions/[submissionId]/metadata">,
) {
  const user = await getApiUser();
  if (user instanceof Response) return user;
  const body = await readJsonBody(request, METADATA_LIMIT_BYTES);
  if (body.kind === "too-large") {
    return Response.json(
      { error: "Metadata request is too large" },
      { status: 413 },
    );
  }
  if (body.kind === "invalid") {
    return Response.json({ error: "Metadata is invalid" }, { status: 400 });
  }
  try {
    const { submissionId } = await context.params;
    await updateDraftProducerMetadata(
      getDatabase(),
      submissionId,
      user,
      body.value,
    );
    return Response.json({ saved: true });
  } catch (error) {
    return safeUploadError(error);
  }
}
