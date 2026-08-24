"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UploadWorkspaceSubmission } from "@/types/uploads";

export function SubmissionActions({
  submission,
  canMutate,
}: {
  submission: UploadWorkspaceSubmission;
  canMutate: boolean;
}) {
  const [title, setTitle] = useState(
    String(submission.producerMetadata.workingTitle ?? submission.title),
  );
  const [description, setDescription] = useState(
    String(submission.producerMetadata.description ?? ""),
  );
  const [acknowledged, setAcknowledged] = useState(submission.acknowledged);
  const [message, setMessage] = useState("");
  if (!canMutate || submission.status !== "draft") return null;
  const allComplete =
    submission.files.length > 0 &&
    submission.files.every((file) => file.uploadStatus === "completed");
  const save = async () => {
    const response = await fetch(`/api/submissions/${submission.id}/metadata`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...submission.producerMetadata,
        workingTitle: title,
        description,
      }),
    });
    setMessage(
      response.ok
        ? "Draft details saved."
        : "Draft details could not be saved.",
    );
  };
  const submit = async () => {
    if (!acknowledged) return;
    if (!submission.acknowledged) {
      const acknowledgement = await fetch(
        `/api/submissions/${submission.id}/acknowledge`,
        { method: "POST" },
      );
      if (!acknowledgement.ok) {
        setMessage("The submission acknowledgement could not be saved.");
        return;
      }
    }
    const response = await fetch(`/api/submissions/${submission.id}/submit`, {
      method: "POST",
    });
    setMessage(
      response.ok
        ? "Submitted for Processing."
        : (((await response.json()) as { error?: string }).error ??
            "Submission failed"),
    );
  };
  const cancel = async () => {
    if (
      !window.confirm(
        "Cancel every unfinished file in this draft? Submitted content is never deleted.",
      )
    )
      return;
    const results = await Promise.all(
      submission.files
        .filter((file) => file.uploadStatus !== "completed")
        .map((file) =>
          fetch(`/api/uploads/${file.sessionId}/cancel`, { method: "POST" }),
        ),
    );
    setMessage(
      results.every((response) => response.ok)
        ? "Draft transfers cancelled."
        : "Some files still require cleanup.",
    );
  };
  return (
    <section
      aria-labelledby="draft-actions-title"
      className="rounded-xl border border-border bg-surface p-5"
    >
      <h2 id="draft-actions-title" className="text-lg font-semibold">
        Draft actions
      </h2>
      <div className="mt-4 grid gap-4">
        <label className="text-sm font-medium">
          Working title
          <Input
            className="mt-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          Description
          <textarea
            className="mt-2 min-h-24 w-full rounded-lg border border-input bg-surface p-3"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </div>
      <label className="mt-4 flex min-h-14 items-start gap-3 rounded-xl border border-border p-4 text-sm leading-6">
        <input
          className="mt-1 size-4"
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        <span>
          I confirm that I am authorised to submit these files for internal
          review.
          <span className="mt-1 block text-xs text-muted-foreground">
            This acknowledgement does not prove ownership or copyright
            clearance.
          </span>
        </span>
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" variant="outline" className="h-11" onClick={save}>
          Save details
        </Button>
        {submission.batchId ? (
          <Button asChild variant="outline" className="h-11">
            <Link href={`/upload/${submission.batchId}`}>Continue Upload</Link>
          </Button>
        ) : null}
        <Button
          type="button"
          className="h-11"
          disabled={!allComplete || !acknowledged}
          onClick={submit}
        >
          Submit for Processing
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="h-11"
          onClick={cancel}
        >
          Cancel Draft
        </Button>
      </div>
      {!allComplete ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Every registered file must be received before submission.
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 text-sm font-medium" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
