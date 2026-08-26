"use client";

import { Download, LoaderCircle, Pause, Play } from "lucide-react";

import { useSoundVaultPlayer } from "@/components/shell/player-provider";
import { Button } from "@/components/ui/button";
import type {
  PlaybackDescriptor,
  PlaybackStatus,
  PlayerQueueItem,
} from "@/types/media";

export function PublishedTrackMediaActions({
  trackId,
  title,
  queue,
  playbackStatus,
  masterPlaybackReady,
}: {
  trackId: string;
  title: string;
  queue: PlayerQueueItem[];
  playbackStatus: PlaybackStatus;
  masterPlaybackReady: boolean;
}) {
  const player = useSoundVaultPlayer();
  const current = player.descriptor?.trackId === trackId;

  async function downloadMaster() {
    const response = await fetch(`/api/library/tracks/${trackId}/playback`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const descriptor = (await response.json()) as PlaybackDescriptor;
    const master = descriptor.sources.find(
      (source) => source.kind === "master",
    );
    if (master) window.location.assign(master.downloadUrl);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {masterPlaybackReady ? (
        <Button
          size="sm"
          aria-label={`${current && player.playing ? "Pause" : "Play"} ${title}`}
          onClick={() =>
            current
              ? player.togglePlayback()
              : void player.playTrack(trackId, queue)
          }
          disabled={player.loading}
        >
          {player.loading && !current ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : current && player.playing ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {current && player.playing ? "Pause" : "Play"}
        </Button>
      ) : (
        <span className="inline-flex min-h-9 items-center text-xs font-semibold text-muted-foreground">
          {playbackStatus === "failed"
            ? "Playback unavailable"
            : "Preparing playback"}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        aria-label={`Download Master for ${title}`}
        onClick={() => void downloadMaster()}
      >
        <Download aria-hidden="true" />
        Master
      </Button>
    </div>
  );
}
