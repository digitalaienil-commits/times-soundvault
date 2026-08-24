import { getDatabase } from "@/lib/database/database";
import { getApiUser, safeUploadError } from "@/lib/domain/uploads/api";
import { canMutateUploadSubmission } from "@/lib/domain/uploads/authorization";
import { parseProcessingConfig } from "@/lib/processing/config";
import {
  getSubmissionProcessingOwner,
  retryRevisionProcessing,
} from "@/lib/processing/repository";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/submissions/[submissionId]/processing/retry">,
) {
  const user = await getApiUser();
  if (user instanceof Response) return user;
  try {
    const { submissionId } = await context.params;
    const database = getDatabase();
    const submission = await getSubmissionProcessingOwner(
      database,
      submissionId,
    );
    if (!submission)
      return Response.json({ error: "Submission not found" }, { status: 404 });
    if (!canMutateUploadSubmission(user, submission.ownerUserId))
      return Response.json({ error: "Access denied" }, { status: 403 });
    await retryRevisionProcessing(database, {
      submissionId,
      revisionId: submission.revisionId,
      maxAttempts: parseProcessingConfig().maxRetries,
    });
    return Response.json({ queued: true });
  } catch (error) {
    return safeUploadError(error);
  }
}
