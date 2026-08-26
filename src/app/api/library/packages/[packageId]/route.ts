import { getAuthState } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { getDownloadPackageStatus } from "@/lib/media/service";

export const runtime = "nodejs";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: RouteContext<"/api/library/packages/[packageId]">,
) {
  const state = await getAuthState();
  if (state.kind !== "authenticated")
    return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(state.user.role, "audio.download"))
    return Response.json(
      { error: "Download access is denied" },
      { status: 403 },
    );
  const { packageId } = await context.params;
  if (!UUID.test(packageId))
    return Response.json({ error: "Package not found" }, { status: 404 });
  const status = await getDownloadPackageStatus(
    packageId,
    state.user.id,
    state.user.role === "admin",
  );
  return status
    ? Response.json(status, {
        status: status.status === "expired" ? 410 : 200,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      })
    : Response.json({ error: "Package not found" }, { status: 404 });
}
