import { getAuthState } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { getPublishedPlaybackDescriptor } from "@/lib/media/repository";

export const runtime = "nodejs";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: RouteContext<"/api/library/tracks/[trackId]/playback">,
) {
  const state = await getAuthState();
  if (state.kind !== "authenticated")
    return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(state.user.role, "audio.listen"))
    return Response.json(
      { error: "Playback access is denied" },
      { status: 403 },
    );
  const { trackId } = await context.params;
  if (!UUID.test(trackId))
    return Response.json(
      { error: "Published track not found" },
      { status: 404 },
    );
  const descriptor = await getPublishedPlaybackDescriptor(trackId);
  return descriptor
    ? Response.json(descriptor, {
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      })
    : Response.json({ error: "Published track not found" }, { status: 404 });
}
