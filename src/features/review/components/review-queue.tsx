import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { ReviewQueueFilters, ReviewQueueResult } from "@/types/review";

import { startReviewAction } from "../actions";

function label(value: string) {
  return value.replaceAll("_", " ");
}

function pageHref(filters: ReviewQueueFilters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, page })) {
    if (value !== "" && value !== "all" && value !== 1)
      params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/review?${query}` : "/review";
}

export function ReviewQueue({
  result,
  filters,
  currentUserId,
}: {
  result: ReviewQueueResult;
  filters: ReviewQueueFilters;
  currentUserId: string;
}) {
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <div className="mt-8 space-y-6">
      <section
        aria-label="Review queue counts"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        {[
          ["Unassigned", result.counts.unassigned],
          ["Mine", result.counts.mine],
          ["In progress", result.counts.inProgress],
          ["Ready for decision", result.counts.readyForDecision],
          ["Needs attention", result.counts.needsAttention],
        ].map(([name, count]) => (
          <div
            key={name}
            className="rounded-xl border border-border bg-surface p-4 shadow-soft"
          >
            <p className="text-xs font-medium text-muted-foreground">{name}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground tabular-nums">
              {count}
            </p>
          </div>
        ))}
      </section>

      <form
        method="get"
        className="grid gap-3 rounded-xl border border-border bg-surface p-5 lg:grid-cols-4 xl:grid-cols-8"
      >
        <label className="text-xs font-medium text-muted-foreground xl:col-span-2">
          Search
          <input
            name="search"
            defaultValue={filters.search}
            placeholder="Track or producer"
            className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
        {[
          ["assignment", "Assignment", ["all", "unassigned", "mine"]],
          [
            "state",
            "Review state",
            ["all", "ready_for_review", "in_review", "ready_for_decision"],
          ],
          ["technical", "Technical", ["all", "clean", "warnings"]],
          [
            "ai",
            "AI",
            ["all", "complete", "partial", "not_configured", "failed"],
          ],
          ["copyright", "Copyright", ["all", "clear", "attention", "pending"]],
          ["rights", "Rights", ["all", "reviewed", "attention"]],
        ].map(([name, title, options]) => (
          <label
            key={name as string}
            className="text-xs font-medium text-muted-foreground"
          >
            {title as string}
            <select
              name={name as string}
              defaultValue={String(filters[name as keyof ReviewQueueFilters])}
              className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            >
              {(options as string[]).map((option) => (
                <option key={option} value={option}>
                  {label(option)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Apply filters
          </Button>
        </div>
      </form>

      <section aria-labelledby="review-results-title">
        <div className="flex items-center justify-between gap-4">
          <h2
            id="review-results-title"
            className="text-lg font-semibold text-foreground"
          >
            Oldest waiting first
          </h2>
          <p className="text-sm text-muted-foreground">
            {result.total} result{result.total === 1 ? "" : "s"}
          </p>
        </div>
        {result.items.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-surface p-10 text-center">
            <p className="font-medium text-foreground">
              Nothing matches these filters
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Adjust the queue filters to see other reviewable submissions.
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {result.items.map((item) => {
              const mine = item.assignedToUserId === currentUserId;
              const canClaim =
                !item.assignedToUserId &&
                item.reviewStatus !== "ready_for_decision";
              return (
                <li key={item.submissionId} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">
                        {item.trackTitle}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.producerName} · Revision {item.revisionNumber} ·{" "}
                        {label(item.submissionStatus)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full bg-muted px-2.5 py-1">
                          QC: {label(item.technicalState)}
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1">
                          AI: {label(item.aiState)}
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1">
                          Copyright: {label(item.copyrightState)}
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1">
                          Rights: {label(item.rightsState)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                      <p className="text-sm text-muted-foreground">
                        {item.reviewStatus === "ready_for_decision"
                          ? "Ready for decision"
                          : item.assignedToName
                            ? `Assigned to ${item.assignedToName}`
                            : "Unassigned"}
                      </p>
                      {canClaim ? (
                        <form action={startReviewAction}>
                          <input
                            type="hidden"
                            name="submissionId"
                            value={item.submissionId}
                          />
                          <Button type="submit">Start review</Button>
                        </form>
                      ) : (
                        <Button asChild variant={mine ? "default" : "outline"}>
                          <Link href={`/review/${item.submissionId}`}>
                            {mine ? "Continue review" : "Open review"}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pages > 1 ? (
        <nav
          aria-label="Review queue pages"
          className="flex items-center justify-between"
        >
          <Button asChild variant="outline" aria-disabled={result.page <= 1}>
            <Link href={pageHref(filters, Math.max(1, result.page - 1))}>
              Previous
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Page {result.page} of {pages}
          </p>
          <Button
            asChild
            variant="outline"
            aria-disabled={result.page >= pages}
          >
            <Link href={pageHref(filters, Math.min(pages, result.page + 1))}>
              Next
            </Link>
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
