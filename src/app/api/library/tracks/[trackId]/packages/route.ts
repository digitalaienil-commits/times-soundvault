import { z } from "zod";
import { getAuthState } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { unexpectedErrorResponse } from "@/lib/http/error-response";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/http/rate-limit";
import { readJsonBody } from "@/lib/http/request-body";
import {
  MediaPackageLimitError,
  requestDownloadPackage,
} from "@/lib/media/service";

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
  const body = await readJsonBody(request, 4 * 1024);
  if (body.kind === "too-large")
    return Response.json(
      { error: "Package request is too large" },
      { status: 413 },
    );
  const parsed = bodySchema.safeParse(body.kind === "ok" ? body.value : null);
  if (!parsed.success)
    return Response.json(
      { error: "Select a valid package type" },
      { status: 400 },
    );
  const limit = await consumeRateLimit(
    RATE_LIMITS.deliveryPackage,
    state.user.id,
  );
  if (!limit.allowed) {
    const response = Response.json(
      { error: "Too many package requests. Please wait and try again." },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return response;
  }
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
    if (error instanceof MediaPackageLimitError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return unexpectedErrorResponse("api/library/packages", error);
  }
}
