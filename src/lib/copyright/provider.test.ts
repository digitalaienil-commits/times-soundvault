import { describe, expect, it } from "vitest";

import { createCopyrightProvider } from "./provider";

describe("manual YouTube provider", () => {
  it("reports honestly that automation is disconnected", () => {
    expect(createCopyrightProvider().getCapabilities()).toEqual({
      connected: false,
      automation: false,
      reason:
        "YouTube automation is not configured. Results must be verified and recorded by a Coordinator or Admin.",
    });
  });
});

describe("YouTube Content ID provider", () => {
  it("reports connected in dry-run mode without credentials", () => {
    const provider = createCopyrightProvider({
      provider: "youtube_content_id",
      root: ".soundvault-copyright",
      maxTracks: 20,
      maxDurationSeconds: 5400,
      gapSeconds: 2,
      retentionDays: 7,
      buildConcurrency: 1,
      leaseMs: 300_000,
      fileTimeoutMs: 1_800_000,
      youtubeDryRun: true,
      youtubePollTimeoutMs: 180_000,
      youtubePollIntervalMs: 10_000,
    });

    expect(provider.name).toBe("youtube_content_id");
    expect(provider.getCapabilities()).toEqual({
      connected: true,
      automation: true,
      reason:
        "YouTube Content ID configured in dry-run mode. Scans run safely with offline simulation.",
    });
  });

  it("reports disconnected when live mode is requested without credentials", () => {
    const provider = createCopyrightProvider({
      provider: "youtube_content_id",
      root: ".soundvault-copyright",
      maxTracks: 20,
      maxDurationSeconds: 5400,
      gapSeconds: 2,
      retentionDays: 7,
      buildConcurrency: 1,
      leaseMs: 300_000,
      fileTimeoutMs: 1_800_000,
      youtubeDryRun: false,
      youtubePollTimeoutMs: 180_000,
      youtubePollIntervalMs: 10_000,
    });

    expect(provider.getCapabilities().connected).toBe(false);
    expect(provider.getCapabilities().automation).toBe(false);
  });

  it("reports connected when live mode is configured with complete credentials", () => {
    const provider = createCopyrightProvider({
      provider: "youtube_content_id",
      root: ".soundvault-copyright",
      maxTracks: 20,
      maxDurationSeconds: 5400,
      gapSeconds: 2,
      retentionDays: 7,
      buildConcurrency: 1,
      leaseMs: 300_000,
      fileTimeoutMs: 1_800_000,
      youtubeClientId: "client-id",
      youtubeClientSecret: "client-secret",
      youtubeRefreshToken: "refresh-token",
      youtubeContentOwnerId: "content-owner-id",
      youtubeDryRun: false,
      youtubePollTimeoutMs: 180_000,
      youtubePollIntervalMs: 10_000,
    });

    expect(provider.getCapabilities()).toEqual({
      connected: true,
      automation: true,
      reason:
        "YouTube Content ID Partner API connected and ready for automated scanning.",
    });
  });
});
