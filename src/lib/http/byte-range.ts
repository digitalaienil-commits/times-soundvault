export interface ResolvedByteRange {
  start: number;
  end: number;
  partial: boolean;
}

export type ByteRangeResult =
  { kind: "range"; range: ResolvedByteRange } | { kind: "invalid" };

export function resolveByteRange(
  header: string | null,
  byteSize: number,
  ifRange?: string | null,
  etag?: string,
): ByteRangeResult {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    return { kind: "invalid" };
  }
  if (!header || (ifRange && etag && ifRange !== etag)) {
    return {
      kind: "range",
      range: { start: 0, end: byteSize - 1, partial: false },
    };
  }
  if (header.includes(",")) return { kind: "invalid" };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return { kind: "invalid" };
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0)
      return { kind: "invalid" };
    return {
      kind: "range",
      range: {
        start: Math.max(0, byteSize - suffix),
        end: byteSize - 1,
        partial: true,
      },
    };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : byteSize - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= byteSize ||
    requestedEnd < start
  ) {
    return { kind: "invalid" };
  }
  return {
    kind: "range",
    range: {
      start,
      end: Math.min(requestedEnd, byteSize - 1),
      partial: true,
    },
  };
}
