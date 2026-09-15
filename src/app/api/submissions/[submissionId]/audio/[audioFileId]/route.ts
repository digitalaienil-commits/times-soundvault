import { getAuthState } from "@/lib/auth/current-user";
import { openSubmissionAudio } from "@/lib/domain/uploads/audio";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(
  request: Request,
  context: RouteContext<"/api/submissions/[submissionId]/audio/[audioFileId]">,
) {
  const state = await getAuthState();
  if (state.kind !== "authenticated") {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { submissionId, audioFileId } = await context.params;
  if (!UUID.test(submissionId) || !UUID.test(audioFileId)) {
    return Response.json({ error: "Audio file not found" }, { status: 404 });
  }
  // A file the caller may not hear is reported as missing rather than
  // forbidden: whether another Producer's submission exists is not theirs
  // to learn.
  const audio = await openSubmissionAudio(
    submissionId,
    audioFileId,
    state.user,
    request.headers.get("range"),
  );
  if (!audio) {
    return Response.json({ error: "Audio file not found" }, { status: 404 });
  }
  if (audio.invalidRange) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${audio.byteSize}` },
    });
  }
  const { start, end, partial } = audio.range;
  return new Response(audio.body, {
    status: partial ? 206 : 200,
    headers: {
      "Content-Type": audio.contentType,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      ...(partial
        ? { "Content-Range": `bytes ${start}-${end}/${audio.byteSize}` }
        : {}),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
