import { ClipboardCheck, FileAudio } from "lucide-react";

import type { SubmissionDto } from "@/types/domain/submission";

interface SubmissionCollectionProps {
  submissions: SubmissionDto[];
  kind: "owned" | "review";
}

const EMPTY_COPY = {
  owned: {
    title: "No submissions yet",
    description:
      "Your uploaded tracks will appear here when the upload workspace is available.",
    Icon: FileAudio,
  },
  review: {
    title: "Nothing waiting for review",
    description: "Submissions ready for Coordinator review will appear here.",
    Icon: ClipboardCheck,
  },
} as const;

export function SubmissionCollection({
  submissions,
  kind,
}: SubmissionCollectionProps) {
  if (submissions.length === 0) {
    const empty = EMPTY_COPY[kind];
    return (
      <section
        aria-labelledby="submission-empty-title"
        className="mt-8 rounded-xl border border-border bg-surface px-6 py-14 text-center sm:px-10 sm:py-20"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
          <empty.Icon
            aria-hidden="true"
            className="size-5"
            strokeWidth={1.75}
          />
        </div>
        <h2
          id="submission-empty-title"
          className="mt-6 text-xl font-semibold tracking-[-0.02em] text-foreground"
        >
          {empty.title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-muted-foreground">
          {empty.description}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="submission-results-title" className="mt-8">
      <h2 id="submission-results-title" className="sr-only">
        {kind === "review" ? "Reviewable submissions" : "Submissions"}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {submissions.map((submission) => (
          <li
            key={submission.id}
            className="flex flex-col gap-2 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7"
          >
            <div>
              <p className="font-semibold text-foreground">
                {submission.title ?? "Untitled track"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Revision {submission.latestRevisionNumber || "not started"}
              </p>
            </div>
            <p className="text-sm font-medium text-foreground">
              {submission.status.replaceAll("_", " ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
