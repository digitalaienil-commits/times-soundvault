"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The end of the upload flow.
 *
 * Submitting used to leave the screen exactly as it was: a finished progress
 * bar, two disabled buttons and a line of green text. Nothing said the work
 * had moved on, and nothing led anywhere, so the producer was left on a form
 * with no next step. This states what happens now and offers the two places
 * worth going.
 */
export function SubmittedPanel({
  batchId,
  submissions,
}: {
  batchId: string;
  submissions: Array<{ submissionId: string; title: string }>;
}) {
  const single = submissions.length === 1 ? submissions[0] : null;

  return (
    <section
      aria-labelledby="submitted-title"
      className="rounded-xl border border-success/25 bg-success/5 p-5"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-success"
        />
        <div className="min-w-0">
          <h3 id="submitted-title" className="font-semibold text-success">
            {submissions.length === 1
              ? "Submitted for review"
              : `${submissions.length} Tracks submitted for review`}
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {submissions.map((submission) => (
              <li key={submission.submissionId} className="break-words">
                {submission.title}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Technical analysis runs automatically, then a Coordinator reviews
            the metadata. You do not need to keep this page open. Progress
            appears in My Uploads, and you will not be able to change the files
            from here once review begins.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild className="h-11">
              <Link
                href={
                  single ? `/submissions/${single.submissionId}` : "/my-uploads"
                }
              >
                {single ? "View submission" : "View my uploads"}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11">
              <Link href="/upload">Upload more</Link>
            </Button>
            <Button asChild variant="ghost" className="h-11">
              <Link href={`/upload/${batchId}`}>Open saved batch</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
