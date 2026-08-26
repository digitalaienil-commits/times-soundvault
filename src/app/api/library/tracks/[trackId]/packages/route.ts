import { z } from "zod";
import { getAuthState } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { requestDownloadPackage } from "@/lib/media/service";

export const runtime = "nodejs";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ scope: z.enum(["stems", "full"]) });

export async function POST(
  request: Request,
  context: RouteContext<"/api/library/tracks/[trackId]/packages">,
) {
  const state = await getAuthState();
  if (state.kind !== "authenticated")
    return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(state.user.role, "audio.download"))
    return Response.json(
      { error: "Download access is denied" },
      { status: 403 },
    );
  const { trackId } = await context.params;
  if (!UUID.test(trackId))
    return Response.json(
      { error: "Published track not found" },
      { status: 404 },
    );
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Select a valid package type" },
      { status: 400 },
    );
  try {
    const result = await requestDownloadPackage({
      trackId,
      scope: parsed.data.scope,
      userId: state.user.id,
    });
    return result
      ? Response.json(
          {
            ...result,
            statusUrl: `/api/library/packages/${result.packageId}`,
          },
          {
            status: result.status === "ready" ? 200 : 202,
            headers: { "Cache-Control": "private, no-store, max-age=0" },
          },
        )
      : Response.json({ error: "Published track not found" }, { status: 404 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Package could not be queued",
      },
      { status: 422 },
    );
  }
}
