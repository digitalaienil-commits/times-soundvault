import { getDatabase } from "@/lib/database/database";
import { getApiUser, safeUploadError } from "@/lib/domain/uploads/api";
import { describeStoredAudioQuietly } from "@/lib/domain/uploads/describe";
import { completeUploadSession } from "@/lib/domain/uploads/repository";
import { parseStorageConfig } from "@/lib/storage/config";
import { createStorageProvider } from "@/lib/storage/factory";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/uploads/[sessionId]/complete">,
) {
  const user = await getApiUser();
  if (user instanceof Response) return user;
  try {
    const { sessionId } = await context.params;
    const session = await completeUploadSession(
      getDatabase(),
      sessionId,
      user,
      parseStorageConfig(),
      createStorageProvider(),
    );
    // The object is stored and the row is committed; labelling it is a
    // convenience for anyone browsing the provider directly, so it must not
    // be able to turn a finished upload into a retry.
    await describeStoredAudioQuietly(getDatabase(), session.audioFileId);
    return Response.json({ session });
  } catch (error) {
    return safeUploadError(error);
  }
}
