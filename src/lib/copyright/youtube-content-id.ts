import "server-only";

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import type { CopyrightManifestItem } from "./manifest";

export interface YouTubeContentIdConfig {
  contentOwnerId?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  testChannelId?: string;
  dryRun: boolean;
  pollTimeoutMs: number;
  pollIntervalMs: number;
}

export interface DetectedContentIdClaim {
  claimId: string;
  assetId: string;
  assetTitle?: string;
  claimantName: string;
  policy: string;
  status: string;
  matchStartMs: number;
  matchEndMs: number;
}

export interface ContentIdScanResult {
  videoId: string;
  claims: DetectedContentIdClaim[];
  isSimulated: boolean;
  scannedAt: Date;
}

export interface HasTimeWindow {
  startMs: number;
  endMs: number;
}

export interface ItemClaimMatch<
  T extends HasTimeWindow = CopyrightManifestItem,
> {
  item: T;
  claims: DetectedContentIdClaim[];
  hasInternalClaim: boolean;
  hasThirdPartyClaim: boolean;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;

export class ContentIdError extends Error {
  constructor(
    public readonly code:
      | "AUTH_FAILED"
      | "UPLOAD_FAILED"
      | "CLAIMS_QUERY_FAILED"
      | "RATE_LIMITED"
      | "CONFIG_MISSING",
    message: string,
  ) {
    super(message);
    this.name = "ContentIdError";
  }
}

/**
 * Exchanges the authorized refresh token for an access token with Google OAuth.
 */
export async function getYouTubeAccessToken(
  config: YouTubeContentIdConfig,
): Promise<string> {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new ContentIdError(
      "CONFIG_MISSING",
      "YouTube Content ID requires client ID, client secret and refresh token",
    );
  }

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ContentIdError(
      "AUTH_FAILED",
      `Failed to refresh YouTube access token (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * Uploads a private operational MP4 test video to the designated test channel.
 */
export async function uploadTestBatchVideo(
  config: YouTubeContentIdConfig,
  mp4Path: string,
  batchId: string,
): Promise<string> {
  if (
    config.dryRun ||
    !config.clientId ||
    !config.clientSecret ||
    !config.refreshToken
  ) {
    const seed = batchId
      .replace(/[^a-zA-Z0-9]/g, "")
      .padEnd(7, "0")
      .slice(0, 7);
    return `sim_${seed}`;
  }

  const token = await getYouTubeAccessToken(config);
  const fileStats = await stat(mp4Path);

  const metadata = {
    snippet: {
      title: `SoundVault Test Batch ${batchId.slice(0, 8)}`,
      description:
        "Private operational Content ID verification batch. Do not claim.",
      categoryId: "10", // Music
      ...(config.testChannelId ? { channelId: config.testChannelId } : {}),
    },
    status: {
      privacyStatus: "private",
      selfDeclaredMadeForKids: false,
    },
  };

  const initUrl = new URL(
    "https://www.googleapis.com/upload/youtube/v3/videos",
  );
  initUrl.searchParams.set("uploadType", "resumable");
  initUrl.searchParams.set("part", "snippet,status");
  if (config.contentOwnerId) {
    initUrl.searchParams.set("onBehalfOfContentOwner", config.contentOwnerId);
  }

  const initResponse = await fetch(initUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(fileStats.size),
    },
    body: JSON.stringify(metadata),
  });

  if (!initResponse.ok) {
    const errorText = await initResponse.text();
    throw new ContentIdError(
      "UPLOAD_FAILED",
      `Failed to initiate YouTube video upload (${initResponse.status}): ${errorText}`,
    );
  }

  const uploadLocation = initResponse.headers.get("location");
  if (!uploadLocation) {
    throw new ContentIdError(
      "UPLOAD_FAILED",
      "YouTube did not return an upload location header",
    );
  }

  const videoStream = createReadStream(mp4Path);
  const uploadResponse = await fetch(uploadLocation, {
    method: "PUT",
    headers: {
      "Content-Length": String(fileStats.size),
      "Content-Type": "video/mp4",
    },
    body: videoStream as unknown as BodyInit,
    // @ts-expect-error Node fetch supports duplex streaming
    duplex: "half",
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new ContentIdError(
      "UPLOAD_FAILED",
      `Failed to stream YouTube video (${uploadResponse.status}): ${errorText}`,
    );
  }

  const videoData = (await uploadResponse.json()) as { id: string };
  if (!videoData.id) {
    throw new ContentIdError(
      "UPLOAD_FAILED",
      "YouTube upload response missing video id",
    );
  }

  return videoData.id;
}

/**
 * Queries YouTube Partner API for Content ID claims on the given video.
 */
export async function queryContentIdClaims(
  config: YouTubeContentIdConfig,
  videoId: string,
): Promise<DetectedContentIdClaim[]> {
  if (
    config.dryRun ||
    !config.clientId ||
    !config.clientSecret ||
    !config.refreshToken ||
    !config.contentOwnerId
  ) {
    return [];
  }

  const token = await getYouTubeAccessToken(config);
  const url = new URL("https://www.googleapis.com/youtube/partner/v1/claims");
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("onBehalfOfContentOwner", config.contentOwnerId);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      throw new ContentIdError(
        "RATE_LIMITED",
        "YouTube Content ID API rate limit reached",
      );
    }
    throw new ContentIdError(
      "CLAIMS_QUERY_FAILED",
      `Failed to query YouTube Content ID claims (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: string;
      assetId: string;
      asset?: { title?: string };
      claimant?: string;
      status?: string;
      policy?: { rules?: Array<{ action?: string }> };
      matchInfo?: {
        matchDetails?: Array<{
          videoOffset?: { startMs?: string | number; endMs?: string | number };
        }>;
      };
    }>;
  };

  const claims: DetectedContentIdClaim[] = [];
  for (const item of data.items ?? []) {
    const matchDetail = item.matchInfo?.matchDetails?.[0];
    const startMs = Number(matchDetail?.videoOffset?.startMs ?? 0);
    const endMs = Number(matchDetail?.videoOffset?.endMs ?? 0);
    claims.push({
      claimId: item.id,
      assetId: item.assetId,
      assetTitle: item.asset?.title,
      claimantName: item.claimant || "Unknown claimant",
      policy: item.policy?.rules?.[0]?.action || "monetize",
      status: item.status || "active",
      matchStartMs: startMs,
      matchEndMs: endMs,
    });
  }

  return claims;
}

/**
 * Deletes the temporary test video from YouTube to keep test channels clean.
 */
export async function deleteTestBatchVideo(
  config: YouTubeContentIdConfig,
  videoId: string,
): Promise<void> {
  if (
    config.dryRun ||
    !config.clientId ||
    !config.clientSecret ||
    !config.refreshToken
  ) {
    return;
  }

  const token = await getYouTubeAccessToken(config);
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("id", videoId);
  if (config.contentOwnerId) {
    url.searchParams.set("onBehalfOfContentOwner", config.contentOwnerId);
  }

  await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {
    // Non-fatal cleanup failure
  });
}

/**
 * Correlates detected YouTube claims with exact manifest items by millisecond timecode.
 */
export function mapClaimsToManifestItems<T extends HasTimeWindow>(
  items: readonly T[],
  claims: readonly DetectedContentIdClaim[],
  internalClaimantKeywords = ["times", "enil", "soundvault"],
): ItemClaimMatch<T>[] {
  return items.map((item) => {
    const matchedClaims = claims.filter((claim) => {
      // Claim overlaps with this item's window in the compiled batch
      return claim.matchStartMs < item.endMs && claim.matchEndMs > item.startMs;
    });

    const hasInternalClaim = matchedClaims.some((claim) => {
      const lower = claim.claimantName.toLowerCase();
      return internalClaimantKeywords.some((keyword) =>
        lower.includes(keyword),
      );
    });

    const hasThirdPartyClaim = matchedClaims.some((claim) => {
      const lower = claim.claimantName.toLowerCase();
      return !internalClaimantKeywords.some((keyword) =>
        lower.includes(keyword),
      );
    });

    return {
      item,
      claims: matchedClaims,
      hasInternalClaim,
      hasThirdPartyClaim,
    };
  });
}

/**
 * Executes the complete Content ID verification workflow for an operational batch.
 */
export async function executeContentIdCheck(options: {
  batchId: string;
  mp4Path: string;
  config: YouTubeContentIdConfig;
}): Promise<ContentIdScanResult> {
  const { batchId, mp4Path, config } = options;

  const videoId = await uploadTestBatchVideo(config, mp4Path, batchId);

  // Poll for claims with backoff
  let claims: DetectedContentIdClaim[] = [];
  if (!config.dryRun) {
    const startTime = Date.now();
    while (Date.now() - startTime < config.pollTimeoutMs) {
      claims = await queryContentIdClaims(config, videoId);
      if (claims.length > 0) break;
      await new Promise((resolve) =>
        setTimeout(resolve, config.pollIntervalMs),
      );
    }
  }

  // Cleanup test video
  await deleteTestBatchVideo(config, videoId);

  return {
    videoId,
    claims,
    isSimulated:
      config.dryRun ||
      !config.clientId ||
      !config.clientSecret ||
      !config.refreshToken,
    scannedAt: new Date(),
  };
}
