import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { ApprovedPublicationItem } from "@/types/decisions";

import { bulkPublishAction } from "../actions";
import { DecisionActionForm } from "./decision-action-form";

export function PublicationQueue({
  items,
  canPublish,
}: {
  items: ApprovedPublicationItem[];
  canPublish: boolean;
}) {
  if (!items.length) return null;
  const bulkItems = items.filter(
    (item) => item.publicationStatus === "unpublished",
  );
  return (
    <section
      aria-labelledby="publication-queue-title"
      className="mt-8 rounded-xl border border-border bg-surface p-5 sm:p-7"
    >
      <h2 id="publication-queue-title" className="text-lg font-semibold">
        Approved — awaiting publication
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Approval promoted canonical metadata. Publication is the separate action
        that exposes a Track in Library.
      </p>
      {canPublish && bulkItems.length ? (
        <DecisionActionForm
          action={bulkPublishAction}
          label="Bulk Publish"
          className="mt-5"
        >
          <ul className="mb-4 grid gap-3 lg:grid-cols-2">
            {bulkItems.map((item) => (
              <li key={item.submissionId}>
                <label className="flex gap-3 rounded-lg border border-border bg-background p-4 text-sm">
                  <input
                    type="checkbox"
                    name="selected"
                    value={item.submissionId}
                    className="mt-0.5 size-4"
                    disabled={!item.gate.allowed}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {item.title}
                    </span>
                    <span className="text-muted-foreground">
                      {item.producerName} ·{" "}
                      {item.gate.allowed ? "Gate ready" : "Blocked"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </DecisionActionForm>
      ) : null}
      <ul className="mt-5 divide-y divide-border border-y border-border">
        {items.map((item) => (
          <li
            key={item.submissionId}
            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.publicationStatus === "withdrawn"
                  ? "Withdrawn — Admin may republish after the gate passes"
                  : item.gate.allowed
                    ? "Publication gate ready"
                    : item.gate.blockers.join(" ")}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/submissions/${item.submissionId}`}>
                Open details
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
