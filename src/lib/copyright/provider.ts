import { parseCopyrightConfig, type CopyrightConfig } from "./config";
import {
  executeContentIdCheck,
  type ContentIdScanResult,
  type YouTubeContentIdConfig,
} from "./youtube-content-id";

export interface CopyrightProviderCapabilities {
  connected: boolean;
  automation: boolean;
  reason: string;
}

export interface CopyrightProvider {
  readonly name: "manual_youtube" | "youtube_content_id";
  getCapabilities(): CopyrightProviderCapabilities;
  checkBatch?(options: {
    batchId: string;
    mp4Path: string;
  }): Promise<ContentIdScanResult>;
}

export class ManualYouTubeCopyrightProvider implements CopyrightProvider {
  readonly name = "manual_youtube" as const;

  getCapabilities(): CopyrightProviderCapabilities {
    return {
      connected: false,
      automation: false,
      reason:
        "YouTube automation is not configured. Results must be verified and recorded by a Coordinator or Admin.",
    };
  }
}

export class YouTubeContentIdProvider implements CopyrightProvider {
  readonly name = "youtube_content_id" as const;

  constructor(private readonly config: CopyrightConfig) {}

  getCapabilities(): CopyrightProviderCapabilities {
    const hasCredentials = Boolean(
      this.config.youtubeClientId &&
      this.config.youtubeClientSecret &&
      this.config.youtubeRefreshToken &&
      this.config.youtubeContentOwnerId,
    );

    if (!hasCredentials && !this.config.youtubeDryRun) {
      return {
        connected: false,
        automation: false,
        reason:
          "YouTube Content ID credentials incomplete. Configure YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN and YOUTUBE_CONTENT_OWNER_ID.",
      };
    }

    return {
      connected: true,
      automation: true,
      reason: this.config.youtubeDryRun
        ? "YouTube Content ID configured in dry-run mode. Scans run safely with offline simulation."
        : "YouTube Content ID Partner API connected and ready for automated scanning.",
    };
  }

  async checkBatch(options: {
    batchId: string;
    mp4Path: string;
  }): Promise<ContentIdScanResult> {
    const ytConfig: YouTubeContentIdConfig = {
      contentOwnerId: this.config.youtubeContentOwnerId,
      clientId: this.config.youtubeClientId,
      clientSecret: this.config.youtubeClientSecret,
      refreshToken: this.config.youtubeRefreshToken,
      testChannelId: this.config.youtubeTestChannelId,
      dryRun: this.config.youtubeDryRun,
      pollTimeoutMs: this.config.youtubePollTimeoutMs,
      pollIntervalMs: this.config.youtubePollIntervalMs,
    };

    return executeContentIdCheck({
      batchId: options.batchId,
      mp4Path: options.mp4Path,
      config: ytConfig,
    });
  }
}

export function createCopyrightProvider(
  config: CopyrightConfig = parseCopyrightConfig(),
): CopyrightProvider {
  if (config.provider === "youtube_content_id") {
    return new YouTubeContentIdProvider(config);
  }
  return new ManualYouTubeCopyrightProvider();
}
