"use client";

import { useRef } from "react";

import type { UploadWorkspaceFile } from "@/types/uploads";

import { formatBytes } from "./batch-summary";

function describeRole(file: UploadWorkspaceFile) {
  if (file.role === "master") return "Master";
  const type = file.stemType?.replaceAll("_", " ") ?? "Stem";
  return file.stemLabel ? `${type} — ${file.stemLabel}` : type;
}

/**
 * The Master and Stems list, with playback for the files that have one.
 *
 * Reviewers and the owning Producer both open this page, and judging a track
 * from its filename and byte count alone is not a review. A file is playable
 * only once processing has reported it as available, so the rest of the row
 * still renders while the queue catches up.
 */
export function SubmissionAudioFiles({
  submissionId,
  files,
}: {
  submissionId: string;
  files: UploadWorkspaceFile[];
}) {
  const players = useRef(new Map<string, HTMLAudioElement>());

  return (
    <ul className="mt-4 divide-y divide-border border-y border-border">
      {files.map((file) => {
        const playable =
          file.technicalStatus === "available" &&
          file.uploadStatus === "completed";
        return (
          <li key={file.audioFileId} className="py-4">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
              <div>
                <p className="font-medium break-all">{file.originalFilename}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {describeRole(file)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {file.containerFormat?.toUpperCase() ?? "Pending verification"}
                <br />
                {formatBytes(file.byteSize)}
              </p>
              <p className="text-sm font-medium">
                {file.uploadStatus === "completed"
                  ? "Files received"
                  : file.uploadStatus.replaceAll("_", " ")}
              </p>
            </div>
            {playable ? (
              <audio
                ref={(node) => {
                  if (node) players.current.set(file.audioFileId, node);
                  else players.current.delete(file.audioFileId);
                }}
                className="mt-3 w-full"
                controls
                preload="metadata"
                src={`/api/submissions/${submissionId}/audio/${file.audioFileId}`}
                // Two Masters playing at once is never what the listener
                // meant; starting one stops the others.
                onPlay={() => {
                  for (const [id, player] of players.current) {
                    if (id !== file.audioFileId) player.pause();
                  }
                }}
              >
                Your browser does not support audio playback.
              </audio>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Playback becomes available once this file finishes processing.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
