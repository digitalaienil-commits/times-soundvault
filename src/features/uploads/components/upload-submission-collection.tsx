"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileAudio, Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utilities/cn";
import type { UploadWorkspaceSubmission } from "@/types/uploads";

import { formatBytes } from "./batch-summary";

export function UploadSubmissionCollection({
  submissions,
  showOwner,
}: {
  submissions: UploadWorkspaceSubmission[];
  showOwner: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [batch, setBatch] = useState("all");
  const filtered = useMemo(
    () =>
      submissions.filter((item) => {
        const matchesQuery = item.title
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        return (
          matchesQuery &&
          (status === "all" || item.status === status) &&
          (batch === "all" || item.batchId === batch)
        );
      }),
    [batch, query, status, submissions],
  );
  const statuses = [...new Set(submissions.map((item) => item.status))];
  const batches = [
    ...new Map(
      submissions
        .filter((item) => item.batchId)
        .map((item) => [
          item.batchId!,
          item.batchLabel ?? item.batchId!.slice(0, 8),
        ]),
    ).entries(),
  ];
  const counts = {
    draft: submissions.filter((item) => item.status === "draft").length,
    uploading: submissions.filter((item) =>
      item.files.some(
        (file) =>
          file.uploadStatus === "uploading" ||
          file.uploadStatus === "paused" ||
          file.uploadStatus === "failed",
      ),
    ).length,
    submitted: submissions.filter((item) => item.status === "submitted").length,
  };
  if (submissions.length === 0) {
    return (
      <section
        aria-labelledby="uploads-empty"
        className="mt-8 rounded-xl border border-border bg-surface px-6 py-16 text-center"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-muted">
          <FileAudio aria-hidden="true" className="size-5" />
        </div>
        <h2 id="uploads-empty" className="mt-5 text-xl font-semibold">
          No submissions yet
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
          Create a single-track or bulk upload. Drafts and transfer progress
          will appear here.
        </p>
        <Link href="/upload" className={cn(buttonVariants(), "mt-5 h-11 px-5")}>
          Start an upload
        </Link>
      </section>
    );
  }
  return (
    <section aria-labelledby="upload-results" className="mt-8 space-y-5">
      <h2 id="upload-results" className="sr-only">
        Upload submissions
      </h2>
      <dl className="grid gap-3 sm:grid-cols-3">
        {Object.entries(counts).map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <dt className="text-sm text-muted-foreground capitalize">
              {label}
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
        <label className="relative text-sm font-medium">
          <span className="sr-only">Search by working title</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
          />
          <Input
            className="pl-9"
            placeholder="Search working title"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          <span className="sr-only">Filter by status</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-surface px-3"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          <span className="sr-only">Filter by batch</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-surface px-3"
            value={batch}
            onChange={(event) => setBatch(event.target.value)}
          >
            <option value="all">All batches</option>
            {batches.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-8 text-center text-muted-foreground">
          No uploads match these filters.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => {
            const pending = item.files.some(
              (file) => file.uploadStatus === "failed",
            )
              ? "Retry failed file"
              : item.status === "draft" &&
                  item.uploadedBytes === item.totalBytes
                ? "Submit for Processing"
                : item.status === "draft"
                  ? "Continue upload"
                  : "Open";
            return (
              <li
                key={item.id}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.title}</p>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                        {item.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    {showOwner ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Owner: {item.ownerName}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-muted-foreground">
                      Revision {item.revisionNumber} · {item.masterCount} Master
                      · {item.stemCount} Stems ·{" "}
                      {formatBytes(item.uploadedBytes)} /{" "}
                      {formatBytes(item.totalBytes)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Updated{" "}
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.updatedAt))}{" "}
                      · {pending}
                    </p>
                  </div>
                  <Link
                    href={`/submissions/${item.id}`}
                    className={cn(
                      buttonVariants({
                        variant:
                          item.status === "draft" ? "default" : "outline",
                      }),
                      "h-11 px-4",
                    )}
                  >
                    {item.status === "draft" ? "Continue" : "Open"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
