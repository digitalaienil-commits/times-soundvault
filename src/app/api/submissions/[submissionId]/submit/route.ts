import { getDatabase } from "@/lib/database/database";
import { getApiUser, safeUploadError } from "@/lib/domain/uploads/api";
import { submitCompletedDraft } from "@/lib/domain/uploads/repository";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/submissions/[submissionId]/submit">,
) {
  const user = await getApiUser();
  if (user instanceof Response) return user;
  try {
    const { submissionId } = await context.params;
    await submitCompletedDraft(getDatabase(), submissionId, user);
    return Response.json({ submitted: true });
  } catch (error) {
    return safeUploadError(error);
  }
}
