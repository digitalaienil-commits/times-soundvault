import { getAuthState } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { openReviewAudio } from "@/lib/review/audio";

export async function GET(
  request: Request,
  context: RouteContext<"/api/review/audio/[audioFileId]">,
) {
  const state = await getAuthState();
  if (state.kind !== "authenticated") {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!hasPermission(state.user.role, "submission.review")) {
    return Response.json(
      { error: "Review audio access is denied" },
      { status: 403 },
    );
  }
  const { audioFileId } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(audioFileId)) {
    return Response.json({ error: "Audio file not found" }, { status: 404 });
  }
  const audio = await openReviewAudio(
    audioFileId,
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
