import type { ReviewQueueItem } from "@/types/review";

import { bulkApproveAction } from "../actions";
import { DecisionActionForm } from "./decision-action-form";

export function BulkApproval({ items }: { items: ReviewQueueItem[] }) {
  const ready = items.filter(
    (item) => item.reviewStatus === "ready_for_decision" && item.rowVersion,
  );
  if (!ready.length) return null;
  return (
    <section
      aria-labelledby="bulk-approve-title"
      className="mt-6 rounded-xl border border-border bg-surface p-5"
    >
      <h2 id="bulk-approve-title" className="font-semibold">
        Bulk Approve
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Select up to 25 clean, ready reviews. The complete batch rolls back if
        any review is stale or has an attention item.
      </p>
      <DecisionActionForm
        action={bulkApproveAction}
        label="Bulk Approve"
        className="mt-4"
      >
        <ul className="mb-4 grid gap-2 sm:grid-cols-2">
          {ready.map((item) => (
            <li key={item.reviewCaseId}>
              <label className="flex gap-3 rounded-lg border border-border bg-background p-3 text-sm">
                <input
                  type="checkbox"
                  name="selected"
                  value={`${item.reviewCaseId}:${item.rowVersion}`}
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="block font-medium">{item.trackTitle}</span>
                  <span className="text-muted-foreground">
                    {item.producerName}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </DecisionActionForm>
    </section>
  );
}
