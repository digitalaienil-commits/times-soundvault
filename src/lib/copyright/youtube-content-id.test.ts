import { describe, expect, it } from "vitest";

import type { CopyrightManifestItem } from "./manifest";
import {
  executeContentIdCheck,
  mapClaimsToManifestItems,
  type DetectedContentIdClaim,
  type YouTubeContentIdConfig,
} from "./youtube-content-id";

describe("mapClaimsToManifestItems", () => {
  const manifestItems: CopyrightManifestItem[] = [
    {
      sequence: 1,
      trackId: "track-1",
      submissionId: "sub-1",
      submissionRevisionId: "rev-1",
      title: "Morning Sun",
      sha256: "a".repeat(64),
      startMs: 0,
      endMs: 30000,
      durationMs: 30000,
    },
    {
      sequence: 2,
      trackId: "track-2",
      submissionId: "sub-2",
      submissionRevisionId: "rev-2",
      title: "Times Theme",
      sha256: "b".repeat(64),
      startMs: 32000,
      endMs: 62000,
      durationMs: 30000,
    },
    {
      sequence: 3,
      trackId: "track-3",
      submissionId: "sub-3",
      submissionRevisionId: "rev-3",
      title: "Clean Track",
      sha256: "c".repeat(64),
      startMs: 64000,
      endMs: 94000,
      durationMs: 30000,
    },
  ];

  it("identifies third-party Content ID claims correctly", () => {
    const claims: DetectedContentIdClaim[] = [
      {
        claimId: "claim-1",
        assetId: "asset-1",
        claimantName: "Universal Music Group",
        policy: "monetize",
        status: "active",
        matchStartMs: 5000,
        matchEndMs: 15000,
      },
    ];

    const matches = mapClaimsToManifestItems(manifestItems, claims);
    expect(matches).toHaveLength(3);

    // Item 1: Universal Music Group claim
    expect(matches[0]?.hasThirdPartyClaim).toBe(true);
    expect(matches[0]?.hasInternalClaim).toBe(false);
    expect(matches[0]?.claims).toHaveLength(1);
    expect(matches[0]?.claims[0]?.claimantName).toBe("Universal Music Group");

    // Item 2: No claim
    expect(matches[1]?.hasThirdPartyClaim).toBe(false);
    expect(matches[1]?.hasInternalClaim).toBe(false);
    expect(matches[1]?.claims).toHaveLength(0);

    // Item 3: No claim
    expect(matches[2]?.hasThirdPartyClaim).toBe(false);
    expect(matches[2]?.claims).toHaveLength(0);
  });

  it("identifies internal Times/ENIL reference matches without flagging as third-party", () => {
    const claims: DetectedContentIdClaim[] = [
      {
        claimId: "claim-times-1",
        assetId: "asset-times-1",
        claimantName: "Times Music / ENIL Group",
        policy: "monetize",
        status: "active",
        matchStartMs: 35000,
        matchEndMs: 45000,
      },
    ];

    const matches = mapClaimsToManifestItems(manifestItems, claims);
    expect(matches[1]?.hasInternalClaim).toBe(true);
    expect(matches[1]?.hasThirdPartyClaim).toBe(false);
    expect(matches[1]?.claims).toHaveLength(1);
  });

  it("does not match claims outside the item's timecode window", () => {
    const claims: DetectedContentIdClaim[] = [
      {
        claimId: "claim-gap",
        assetId: "asset-gap",
        claimantName: "Sony Music",
        policy: "block",
        status: "active",
        matchStartMs: 30001,
        matchEndMs: 31999,
      },
    ];

    const matches = mapClaimsToManifestItems(manifestItems, claims);
    expect(matches.every((m) => m.claims.length === 0)).toBe(true);
  });
});

describe("executeContentIdCheck", () => {
  it("executes simulated dry-run check with valid 11-char video ID", async () => {
    const config: YouTubeContentIdConfig = {
      dryRun: true,
      pollTimeoutMs: 1000,
      pollIntervalMs: 200,
    };

    const result = await executeContentIdCheck({
      batchId: "12345678-abcd-ef01-2345-6789abcdef01",
      mp4Path: "/tmp/test.mp4",
      config,
    });

    expect(result.isSimulated).toBe(true);
    expect(result.videoId).toHaveLength(11);
    expect(/^[A-Za-z0-9_-]{11}$/.test(result.videoId)).toBe(true);
    expect(result.claims).toEqual([]);
  });
});
