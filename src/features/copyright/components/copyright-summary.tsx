import type { CopyrightSummaryDto } from "@/types/copyright";

import { StatusLabel } from "./status-label";

export function CopyrightSummary({
  summary,
  stageEnabled = true,
}: {
  summary: CopyrightSummaryDto | null;
  /**
   * False when this deployment does not require a copyright outcome. Saying so
   * is the point: an empty panel looks like a check that has not run yet, and
   * a reviewer would wait for something that is never coming.
   */
  stageEnabled?: boolean;
}) {
  return (
    <section
      aria-labelledby="copyright-summary-title"
      className="rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="copyright-summary-title" className="text-lg font-semibold">
            YouTube copyright check
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only status for this exact Submission Revision.
          </p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">
          {stageEnabled ? "Manual mode" : "Not in use"}
        </span>
      </div>
      {!stageEnabled ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Copyright checks are switched off for this deployment, so publication
          does not wait for one. Published Tracks record that no check was
          required rather than that one passed. Turn the stage back on with
          COPYRIGHT_STAGE_ENABLED once a Content ID account is available.
        </p>
      ) : summary ? (
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Workflow
            </dt>
            <dd>
              <StatusLabel value={summary.status} />
            </dd>
          </div>
          <div>
            <dt className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Observed result
            </dt>
            <dd>
              <StatusLabel value={summary.outcome} />
            </dd>
          </div>
          <div>
            <dt className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Content ID readiness
            </dt>
            <dd>
              <StatusLabel value={summary.readinessStatus} />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Manual review required. No current check has been recorded yet.
        </p>
      )}
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        No claim observed is not copyright clearance. It does not prove
        ownership or guarantee that a future claim will not appear.
      </p>
    </section>
  );
}
