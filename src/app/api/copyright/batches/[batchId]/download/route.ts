import { Readable } from "node:stream";

import { getAuthState } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import {
  openArtifactForStreaming,
  resolveCopyrightRoot,
} from "@/lib/copyright/artifacts";
import { parseCopyrightConfig } from "@/lib/copyright/config";
import { getBatchArtifactMetadata } from "@/lib/copyright/repository";
import { getDatabase } from "@/lib/database/database";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/copyright/batches/[batchId]/download">,
) {
  const state = await getAuthState();
  if (state.kind !== "authenticated")
    return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(state.user.role, "copyright.prepare"))
    return Response.json(
      { error: "Copyright batch access is denied" },
      { status: 403 },
    );
  const { batchId } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(batchId))
    return Response.json({ error: "Batch not found" }, { status: 404 });
  const metadata = await getBatchArtifactMetadata(getDatabase(), batchId);
  if (!metadata)
    return Response.json(
      { error: "Batch artifact is unavailable or expired" },
      { status: 404 },
    );
  const config = parseCopyrightConfig();
  const artifact = await openArtifactForStreaming(
    resolveCopyrightRoot(config.root),
    metadata.artifactKey,
  );
  return new Response(Readable.toWeb(artifact.stream) as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(artifact.byteSize),
      "Content-Disposition": `attachment; filename="soundvault-copyright-${batchId}.mp4"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
