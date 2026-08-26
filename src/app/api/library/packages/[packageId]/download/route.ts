import { getAuthState } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { mediaObjectResponse } from "@/lib/media/http";
import { getPublishedPackageObject } from "@/lib/media/repository";

export const runtime = "nodejs";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function respond(
  request: Request,
  context: RouteContext<"/api/library/packages/[packageId]/download">,
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
  const result = await getPublishedPackageObject(packageId);
  if (result?.kind === "expired")
    return Response.json({ error: "Package has expired" }, { status: 410 });
  return result?.kind === "ready"
    ? mediaObjectResponse(request, result.object, "attachment")
    : Response.json({ error: "Package not found" }, { status: 404 });
}

export const GET = respond;
export const HEAD = respond;
