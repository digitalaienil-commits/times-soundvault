import { getAuthState } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { mediaObjectResponse } from "@/lib/media/http";
import { getPublishedMediaObject } from "@/lib/media/repository";

export const runtime = "nodejs";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function respond(
  request: Request,
  context: RouteContext<"/api/library/tracks/[trackId]/audio/[audioAssetId]">,
) {
  const state = await getAuthState();
  if (state.kind !== "authenticated")
    return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(state.user.role, "audio.listen"))
    return Response.json(
      { error: "Playback access is denied" },
      { status: 403 },
    );
  const { trackId, audioAssetId } = await context.params;
  if (!UUID.test(trackId) || !UUID.test(audioAssetId))
    return Response.json(
      { error: "Published audio not found" },
      { status: 404 },
    );
  const object = await getPublishedMediaObject(
    trackId,
    audioAssetId,
    "preview",
  );
  return object
    ? mediaObjectResponse(request, object, "inline")
    : Response.json({ error: "Published audio not found" }, { status: 404 });
}

export const GET = respond;
export const HEAD = respond;
