import Link from "next/link";

import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/types/auth";
import type { SubmissionDecisionSummary } from "@/types/decisions";
import type { SubmissionStatus } from "@/types/domain/submission";

import {
  confirmRejectDecisionAction,
  publishDecisionAction,
  returnForChangesDecisionAction,
  withdrawDecisionAction,
} from "../actions";
import { DecisionActionForm } from "./decision-action-form";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SubmissionDecisionSummaryPanel({
  submissionId,
  submissionStatus,
  summary,
  user,
  canRevise,
}: {
  submissionId: string;
  submissionStatus: SubmissionStatus;
  summary: SubmissionDecisionSummary;
  user: CurrentUser;
  canRevise: boolean;
}) {
  const recommendation = summary.decisions.find(
    (decision) => decision.type === "recommend_reject",
  );
  const resolution = summary.decisions.find(
    (decision) =>
      decision.type === "confirm_reject" ||
      decision.type === "return_for_changes",
  );
  const canConfirm = hasPermission(user.role, "submission.confirmReject");
  const canPublish = hasPermission(user.role, "submission.publish");
  const canWithdraw = hasPermission(user.role, "submission.unpublish");

  return (
    <section
      aria-labelledby="decision-summary-title"
      className="mt-6 rounded-xl border border-border bg-surface p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="decision-summary-title" className="text-xl font-semibold">
            Decision and publication
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Approval and publication are separate governed actions.
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold capitalize">
          {summary.publicationStatus.replaceAll("_", " ")}
        </span>
      </div>

      {submissionStatus === "changes_requested" && summary.changeRequest ? (
        <div className="mt-5 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <h3 className="font-semibold">Changes requested</h3>
          <p className="mt-2 text-sm leading-6">
            {summary.changeRequest.producerSummary}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {summary.changeRequest.items.map((item) => (
              <li key={item.id} className="rounded-lg bg-surface p-3">
                <span className="font-semibold capitalize">
                  {item.category}:
                </span>{" "}
                {item.instruction}
              </li>
            ))}
          </ul>
          {canRevise ? (
            <Button asChild className="mt-4">
              <Link href={`/upload?submissionId=${submissionId}`}>
                Revise Submission
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {submissionStatus === "rejection_recommended" ? (
        <div className="mt-5 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <h3 className="font-semibold">Decision pending</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            A rejection recommendation is awaiting Admin resolution. This is not
            a final rejection.
          </p>
        </div>
      ) : null}

      {submissionStatus === "rejected" ? (
        <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <h3 className="font-semibold">Rejected</h3>
          <p className="mt-2 text-sm">
            {resolution?.producerSummary ??
              "An Admin confirmed the final rejection."}
          </p>
        </div>
      ) : null}

      {canConfirm && recommendation && !resolution ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-border bg-background p-4">
            <h3 className="font-semibold">Confirm final rejection</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Admin-only. The final reason is visible to the Producer.
            </p>
            <DecisionActionForm
              action={confirmRejectDecisionAction}
              label="Confirm Rejection"
              variant="destructive"
              className="mt-4"
            >
              <input
                type="hidden"
                name="recommendationId"
                value={recommendation.id}
              />
              <label className="block text-sm font-medium">
                Final reason for Producer
                <textarea
                  name="producerReason"
                  rows={3}
                  required
                  className={inputClass}
                />
              </label>
              <label className="mt-3 block text-sm font-medium">
                Private Admin note (optional)
                <textarea name="adminNote" rows={3} className={inputClass} />
              </label>
            </DecisionActionForm>
          </article>
          <article className="rounded-xl border border-border bg-background p-4">
            <h3 className="font-semibold">Return to Producer</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Convert the recommendation into a structured change request.
            </p>
            <DecisionActionForm
              action={returnForChangesDecisionAction}
              label="Return for Changes"
              variant="outline"
              className="mt-4"
            >
              <input
                type="hidden"
                name="recommendationId"
                value={recommendation.id}
              />
              <label className="block text-sm font-medium">
                Summary for Producer
                <textarea
                  name="producerSummary"
                  rows={3}
                  required
                  className={inputClass}
                />
              </label>
              <div className="my-3 grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <label className="text-sm font-medium">
                  Category
                  <select name="itemCategory" className={inputClass}>
                    {[
                      "audio",
                      "stems",
                      "technical",
                      "metadata",
                      "rights",
                      "copyright",
                      "other",
                    ].map((category) => (
                      <option key={category} value={category}>
                        {category[0]!.toUpperCase() + category.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Required change
                  <textarea
                    name="itemInstruction"
                    rows={3}
                    required
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Private Admin note (optional)
                <textarea name="adminNote" rows={2} className={inputClass} />
              </label>
            </DecisionActionForm>
          </article>
        </div>
      ) : null}

      {submissionStatus === "approved" && summary.publicationGate ? (
        <div className="mt-6 rounded-xl border border-border bg-background p-4">
          <h3 className="font-semibold">
            {summary.publicationStatus === "published"
              ? "Published to Library"
              : summary.publicationStatus === "withdrawn"
                ? "Withdrawn from Library"
                : "Approved — awaiting publication"}
          </h3>
          {summary.publicationGate.allowed ? (
            <p className="mt-2 text-sm text-success">
              All publication gate requirements currently pass.
            </p>
          ) : (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-destructive">
              {summary.publicationGate.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}

          {canPublish && summary.publicationStatus !== "published" ? (
            <DecisionActionForm
              action={publishDecisionAction}
              label={
                summary.publicationStatus === "withdrawn"
                  ? "Republish"
                  : "Publish to Library"
              }
              className="mt-4"
            >
              <input type="hidden" name="submissionId" value={submissionId} />
              {summary.publicationStatus === "withdrawn" ? (
                <label className="mb-3 block text-sm font-medium">
                  Republish reason
                  <textarea
                    name="reason"
                    rows={2}
                    required
                    className={inputClass}
                  />
                </label>
              ) : null}
            </DecisionActionForm>
          ) : null}

          {canWithdraw && summary.publicationStatus === "published" ? (
            <DecisionActionForm
              action={withdrawDecisionAction}
              label="Withdraw from Library"
              variant="destructive"
              className="mt-4 border-t border-border pt-4"
            >
              <input type="hidden" name="submissionId" value={submissionId} />
              <label className="block text-sm font-medium">
                Withdrawal reason
                <textarea
                  name="reason"
                  rows={2}
                  required
                  className={inputClass}
                />
              </label>
              <label className="my-3 flex gap-2 text-sm">
                <input
                  type="checkbox"
                  name="confirmed"
                  className="mt-0.5 size-4"
                />
                I confirm this Track should no longer be visible in Library.
              </label>
            </DecisionActionForm>
          ) : null}
        </div>
      ) : null}

      {summary.publicationHistory.length ? (
        <div className="mt-6">
          <h3 className="font-semibold">Publication history</h3>
          <ol className="mt-3 space-y-3">
            {summary.publicationHistory.map((event) => (
              <li key={event.id} className="border-l-2 border-border pl-3">
                <p className="text-sm font-medium capitalize">
                  {event.type} · {event.actorName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(event.createdAt)}
                  {event.reason ? ` · ${event.reason}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
