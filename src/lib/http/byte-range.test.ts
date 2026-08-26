import { describe, expect, it } from "vitest";
import { resolveByteRange } from "./byte-range";

describe("resolveByteRange", () => {
  it("returns the full representation without Range", () => {
    expect(resolveByteRange(null, 100)).toEqual({
      kind: "range",
      range: { start: 0, end: 99, partial: false },
    });
  });
  it.each([
    ["bytes=0-9", 0, 9],
    ["bytes=90-", 90, 99],
    ["bytes=-10", 90, 99],
    ["bytes=0-999", 0, 99],
  ])("resolves %s", (header, start, end) => {
    expect(resolveByteRange(header, 100)).toEqual({
      kind: "range",
      range: { start, end, partial: true },
    });
  });
  it.each(["bytes=100-", "bytes=9-4", "bytes=0-1,4-5", "items=0-1"])(
    "rejects %s",
    (header) =>
      expect(resolveByteRange(header, 100)).toEqual({ kind: "invalid" }),
  );
  it("ignores Range when If-Range does not match", () => {
    expect(resolveByteRange("bytes=4-9", 100, '"old"', '"new"')).toEqual({
      kind: "range",
      range: { start: 0, end: 99, partial: false },
    });
  });
});
