export type PlaybackStatus = "preparing" | "ready" | "partial" | "failed";

export interface PlaybackSourceDescriptor {
  audioAssetId: string;
  kind: "master" | "stem";
  label: string;
  durationMs: number | null;
  sourceFormat: string | null;
  sourceByteSize: number;
  ready: boolean;
  streamUrl: string | null;
  downloadUrl: string;
  waveformPeaks: number[] | null;
}

export interface PlaybackDescriptor {
  trackId: string;
  title: string;
  versionLabel: string | null;
  status: PlaybackStatus;
  masterPlaybackReady: boolean;
  sources: PlaybackSourceDescriptor[];
}

export interface PlayerQueueItem {
  trackId: string;
  title: string;
  versionLabel: string | null;
  durationMs: number | null;
}

export type DownloadPackageScope = "stems" | "full";
export type DownloadPackageStatus =
  "queued" | "building" | "ready" | "failed" | "expired" | "cancelled";

export interface DownloadPackageDto {
  packageId: string;
  scope: DownloadPackageScope;
  status: DownloadPackageStatus;
  byteSize: number | null;
  expiresAt: string | null;
  safeFilename: string;
  downloadUrl: string | null;
}
