"use client";

import { useRef } from "react";

import type { ReviewAudioFile } from "@/types/review";

function metric(value: number | null, suffix: string) {
  return value == null ? null : `${value.toLocaleString()}${suffix}`;
}

export function ReviewAudioList({ files }: { files: ReviewAudioFile[] }) {
  const players = useRef(new Map<string, HTMLAudioElement>());
  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No available review audio.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {files.map((file) => (
        <li
          key={file.id}
          className="rounded-lg border border-border bg-background p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium text-foreground">{file.label}</p>
            <p className="text-xs text-muted-foreground">
              {[
                file.containerFormat?.toUpperCase(),
                metric(file.sampleRateHz, " Hz"),
                metric(file.bitDepth, "-bit"),
                metric(file.channels, " ch"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <audio
            ref={(node) => {
              if (node) players.current.set(file.id, node);
              else players.current.delete(file.id);
            }}
            className="mt-3 w-full"
            controls
            preload="metadata"
            src={`/api/review/audio/${file.id}`}
            onPlay={() => {
              for (const [id, player] of players.current) {
                if (id !== file.id) player.pause();
              }
            }}
          >
            Your browser does not support audio playback.
          </audio>
        </li>
      ))}
    </ul>
  );
}
