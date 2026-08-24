import { describe, expect, it } from "vitest";

import { parseAudioByteRange } from "./audio";

describe("review audio byte ranges", () => {
  it("serves complete and bounded ranges", () => {
    expect(parseAudioByteRange(null, 100)).toEqual({
      start: 0,
      end: 99,
      partial: false,
    });
    expect(parseAudioByteRange("bytes=10-29", 100)).toEqual({
      start: 10,
      end: 29,
      partial: true,
    });
    expect(parseAudioByteRange("bytes=90-", 100)).toEqual({
      start: 90,
      end: 99,
      partial: true,
    });
    expect(parseAudioByteRange("bytes=-10", 100)).toEqual({
      start: 90,
      end: 99,
      partial: true,
    });
  });

  it("rejects multiple, inverted and unsatisfiable ranges", () => {
    expect(parseAudioByteRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseAudioByteRange("bytes=50-10", 100)).toBeNull();
    expect(parseAudioByteRange("bytes=100-", 100)).toBeNull();
  });
});
