import { getDatabase } from "@/lib/database/database";
import { getApiUser, safeUploadError } from "@/lib/domain/uploads/api";
import { updateDraftProducerMetadata } from "@/lib/domain/uploads/repository";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/submissions/[submissionId]/metadata">,
) {
  const user = await getApiUser();
  if (user instanceof Response) return user;
  try {
    const { submissionId } = await context.params;
    await updateDraftProducerMetadata(
      getDatabase(),
      submissionId,
      user,
      await request.json(),
    );
    return Response.json({ saved: true });
  } catch (error) {
    return safeUploadError(error);
  }
}
