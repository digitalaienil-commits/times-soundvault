import "server-only";

import { contentDisposition } from "@/lib/http/content-disposition";
import { resolveByteRange } from "@/lib/http/byte-range";
import { createStorageProviderForKind } from "@/lib/storage/factory";
import type { PublishedMediaObject } from "./repository";

const BASE_HEADERS = {
  "Accept-Ranges": "bytes",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Accel-Buffering": "no",
} as const;

export async function mediaObjectResponse(
  request: Request,
  object: PublishedMediaObject,
  disposition: "inline" | "attachment",
) {
  const etag = `"${object.checksumSha256}"`;
  const resolved = resolveByteRange(
    request.headers.get("range"),
    object.byteSize,
    request.headers.get("if-range"),
    etag,
  );
  if (resolved.kind === "invalid") {
    return new Response(null, {
      status: 416,
      headers: {
        ...BASE_HEADERS,
        ETag: etag,
        "Content-Range": `bytes */${object.byteSize}`,
      },
    });
  }
  const { start, end, partial } = resolved.range;
  const headers = {
    ...BASE_HEADERS,
    ETag: etag,
    "Content-Type": object.contentType,
    "Content-Length": String(end - start + 1),
    "Content-Disposition": contentDisposition(
      disposition,
      object.originalFilename,
    ),
    ...(partial
      ? { "Content-Range": `bytes ${start}-${end}/${object.byteSize}` }
      : {}),
  };
  if (request.method === "HEAD") {
    return new Response(null, { status: partial ? 206 : 200, headers });
  }
  const provider = createStorageProviderForKind(object.storageBackend);
  const opened = await provider.openStoredObject({
    storageKey: object.storageKey,
    providerDriveId: object.providerDriveId,
    providerItemId: object.providerItemId,
    start,
    end,
  });
  const response = new Response(opened.body, {
    status: partial ? 206 : 200,
    headers,
  });
  if (request.signal.aborted) opened.abort();
  else
    request.signal.addEventListener("abort", () => opened.abort(), {
      once: true,
    });
  return response;
}
