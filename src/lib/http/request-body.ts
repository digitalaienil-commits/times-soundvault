/**
 * Bounded JSON request reading.
 *
 * Route handlers must never call `request.json()` directly on a sensitive
 * endpoint: an attacker can otherwise stream an unbounded body into server
 * memory. These helpers cap the declared and the actual length.
 */

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 64 * 1024;

export type JsonBodyResult<T> =
  { kind: "ok"; value: T } | { kind: "too-large" } | { kind: "invalid" };

export async function readJsonBody<T = unknown>(
  request: Request,
  maxBytes: number = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<JsonBodyResult<T>> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) {
      return { kind: "invalid" };
    }
    if (length > maxBytes) {
      return { kind: "too-large" };
    }
  }

  const body = request.body;
  if (!body) {
    return { kind: "invalid" };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      // A body may under-declare or omit Content-Length, so the actual
      // stream is capped too and cancelled as soon as it exceeds the limit.
      if (received > maxBytes) {
        await reader.cancel();
        return { kind: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "invalid" };
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { kind: "ok", value: JSON.parse(new TextDecoder().decode(merged)) };
  } catch {
    return { kind: "invalid" };
  }
}
