"use client";

import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { UploadWorkspaceSubmission } from "@/types/uploads";

import { formatBytes } from "./batch-summary";

interface MatchedFile {
  sessionId: string;
  originalFilename: string;
  expectedBytes: number;
  file: File;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    return (
      ((await response.json()) as { error?: string }).error ?? "Transfer failed"
    );
  } catch {
    return "Transfer failed";
  }
}

export function ResumeTransferPanel({
  submissions,
}: {
  submissions: UploadWorkspaceSubmission[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [matched, setMatched] = useState<MatchedFile[]>([]);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const pending = submissions
    .flatMap((submission) => submission.files)
    .filter(
      (file) =>
        file.uploadStatus !== "completed" && file.uploadStatus !== "cancelled",
    );
  if (pending.length === 0)
    return (
      <p className="rounded-xl border border-success/30 bg-surface p-5 text-sm text-success">
        All registered files have been received.
      </p>
    );
  const selectFiles = (files: File[]) => {
    const next: MatchedFile[] = [];
    for (const pendingFile of pending) {
      const selected = files.find(
        (file) =>
          file.name === pendingFile.originalFilename &&
          file.size === pendingFile.byteSize,
      );
      if (selected)
        next.push({
          sessionId: pendingFile.sessionId,
          originalFilename: pendingFile.originalFilename,
          expectedBytes: pendingFile.byteSize,
          file: selected,
        });
    }
    setMatched(next);
    setMessage(
      `${next.length} of ${pending.length} unfinished files matched by original name and exact size.`,
    );
  };
  const resume = async () => {
    setRunning(true);
    try {
      let cursor = 0;
      const worker = async () => {
        while (cursor < matched.length) {
          const item = matched[cursor++];
          if (!item) continue;
          const statusResponse = await fetch(
            `/api/uploads/${item.sessionId}/status`,
          );
          if (!statusResponse.ok)
            throw new Error(await errorMessage(statusResponse));
          let offset = (
            (await statusResponse.json()) as {
              session: { uploadedByteSize: number };
            }
          ).session.uploadedByteSize;
          while (offset < item.expectedBytes) {
            const end = Math.min(offset + 10 * 1024 * 1024, item.expectedBytes);
            const response = await fetch(
              `/api/uploads/${item.sessionId}/chunk`,
              {
                method: "PUT",
                headers: {
                  "Content-Range": `bytes ${offset}-${end - 1}/${item.expectedBytes}`,
                },
                body: item.file.slice(offset, end),
              },
            );
            if (!response.ok) throw new Error(await errorMessage(response));
            offset = (
              (await response.json()) as {
                session: { uploadedByteSize: number };
              }
            ).session.uploadedByteSize;
          }
          const complete = await fetch(
            `/api/uploads/${item.sessionId}/complete`,
            { method: "POST" },
          );
          if (!complete.ok) throw new Error(await errorMessage(complete));
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(3, matched.length) }, worker),
      );
      setMessage(
        "Selected uploads completed. Refresh to see the verified file state.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Resume failed");
    } finally {
      setRunning(false);
    }
  };
  return (
    <section
      aria-labelledby="resume-transfer-title"
      className="rounded-xl border border-border bg-surface p-5"
    >
      <h2 id="resume-transfer-title" className="text-lg font-semibold">
        Resume unfinished transfers
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        For browser security, reselect the same local files after a refresh.
        SoundVault matches the exact original name and byte size, then resumes
        from the server-confirmed byte range.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".wav,.mp3"
        multiple
        className="sr-only"
        aria-label="Reselect files for resumable upload"
        onChange={(event) =>
          selectFiles(Array.from(event.currentTarget.files ?? []))
        }
      />
      <ul className="mt-4 divide-y divide-border border-y border-border">
        {pending.map((file) => (
          <li
            key={file.sessionId}
            className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="font-medium break-all">
              {file.originalFilename}
            </span>
            <span className="text-muted-foreground">
              {formatBytes(file.uploadedBytes)} / {formatBytes(file.byteSize)} ·{" "}
              {file.uploadStatus}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => inputRef.current?.click()}
        >
          Reselect files
        </Button>
        <Button
          type="button"
          className="h-11"
          disabled={running || matched.length === 0}
          onClick={resume}
        >
          <RotateCcw aria-hidden="true" />
          {running ? "Resuming…" : "Resume matched files"}
        </Button>
      </div>
      {message ? (
        <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
