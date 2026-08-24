import { describe, expect, it } from "vitest";

import { buildCopyrightManifest } from "./manifest";

describe("copyright test-batch manifest", () => {
  it("uses deterministic ordering, timestamps, durations, and silence gaps", () => {
    const manifest = buildCopyrightManifest(
      "00000000-0000-4000-8000-000000000001",
      [
        {
          submissionId: "submission-1",
          submissionRevisionId: "revision-1",
          trackId: "track-1",
          title: "Synthetic one",
          sha256: "a".repeat(64),
          durationMs: 1_000,
        },
        {
          submissionId: "submission-2",
          submissionRevisionId: "revision-2",
          trackId: "track-2",
          title: "Synthetic two",
          sha256: "b".repeat(64),
          durationMs: 2_000,
        },
      ],
      2_000,
    );
    expect(manifest.totalDurationMs).toBe(5_000);
    expect(
      manifest.items.map(({ sequence, startMs, endMs }) => ({
        sequence,
        startMs,
        endMs,
      })),
    ).toEqual([
      { sequence: 1, startMs: 0, endMs: 1_000 },
      { sequence: 2, startMs: 3_000, endMs: 5_000 },
    ]);
    expect(JSON.stringify(manifest)).not.toContain("storage");
    expect(manifest.warning).toContain("must never be registered");
  });

  it("allowlists public manifest fields when the runtime source has private storage data", () => {
    const source = {
      submissionId: "submission-1",
      submissionRevisionId: "revision-1",
      trackId: "track-1",
      title: "Synthetic",
      sha256: "a".repeat(64),
      durationMs: 1_000,
      storageKey: "private/do-not-export.wav",
      providerItemId: "private-provider-item",
    };
    const serialized = JSON.stringify(
      buildCopyrightManifest(
        "00000000-0000-4000-8000-000000000001",
        [source],
        2_000,
      ),
    );
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("providerItemId");
    expect(serialized).not.toContain("private/");
  });
});
