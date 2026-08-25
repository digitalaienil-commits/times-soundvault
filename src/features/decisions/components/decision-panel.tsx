import { AlertTriangle, CheckCircle2, RotateCcw, XCircle } from "lucide-react";

import { hasPermission } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/types/auth";
import type { ReviewDecisionPacket } from "@/types/review";

import {
  approveDecisionAction,
  recommendRejectDecisionAction,
  requestChangesDecisionAction,
} from "../actions";
import { DecisionActionForm } from "./decision-action-form";

function HiddenDecision({ packet }: { packet: ReviewDecisionPacket }) {
  return (
    <>
      <input type="hidden" name="reviewCaseId" value={packet.reviewCaseId} />
      <input type="hidden" name="reviewVersion" value={packet.reviewVersion} />
    </>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DecisionPanel({
  packet,
  user,
}: {
  packet: ReviewDecisionPacket;
  user: CurrentUser;
}) {
  const attention = packet.attentionItems;
  const copyrightOutcome = packet.copyrightSummary?.outcome;
  return (
    <section
      aria-labelledby="decision-panel-title"
      className="mt-6 rounded-xl border border-border bg-surface p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Locked Coordinator Review Draft
          </p>
          <h2
            id="decision-panel-title"
            className="mt-2 text-xl font-semibold text-foreground"
          >
            Decision panel
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Approval promotes this locked draft to canonical metadata.
            Publishing remains a separate governed action.
          </p>
        </div>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-foreground">
          Revision locked
        </span>
      </div>

      {copyrightOutcome === "no_claim_observed" ? (
        <p className="mt-5 rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
          <strong>No claim observed.</strong> This records the completed manual
          check; it is not proof of copyright clearance.
        </p>
      ) : null}

      {attention.length ? (
        <div className="mt-5 rounded-lg border border-warning/40 bg-warning/5 p-4">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <AlertTriangle aria-hidden="true" className="size-4" />
            {attention.length} attention item
            {attention.length === 1 ? "" : "s"}
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {attention.map((item) => (
              <li key={item.code}>
                {item.code.replaceAll("_", " ")}: {item.note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {hasPermission(user.role, "submission.approve") ? (
          <article className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2
                aria-hidden="true"
                className="size-5 text-success"
              />
              <h3 className="font-semibold">Approve</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Promote canonical metadata and taxonomy. The Track stays
              unpublished.
            </p>
            <DecisionActionForm
              action={approveDecisionAction}
              label="Approve"
              className="mt-4"
            >
              <HiddenDecision packet={packet} />
              {attention.length ? (
                <>
                  <label className="flex gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      name="acknowledgeAttention"
                      className="mt-0.5 size-4 accent-brand"
                    />
                    I reviewed and accept every attention item above.
                  </label>
                  <label className="mt-3 block text-sm font-medium">
                    Approval note
                    <textarea
                      name="attentionNote"
                      rows={3}
                      className={inputClass}
                      placeholder="Explain why approval remains appropriate."
                    />
                  </label>
                </>
              ) : null}
            </DecisionActionForm>
          </article>
        ) : null}

        {hasPermission(user.role, "submission.requestChanges") ? (
          <article className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <RotateCcw aria-hidden="true" className="size-5" />
              <h3 className="font-semibold">Request Changes</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Send clear, Producer-visible instructions for Revision N+1.
            </p>
            <DecisionActionForm
              action={requestChangesDecisionAction}
              label="Request Changes"
              variant="outline"
              className="mt-4"
            >
              <HiddenDecision packet={packet} />
              <label className="block text-sm font-medium">
                Summary for Producer
                <textarea
                  name="producerSummary"
                  rows={3}
                  required
                  className={inputClass}
                />
              </label>
              <div className="my-3 grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] xl:grid-cols-1">
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
            </DecisionActionForm>
          </article>
        ) : null}

        {hasPermission(user.role, "submission.recommendReject") ? (
          <article className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <XCircle aria-hidden="true" className="size-5 text-destructive" />
              <h3 className="font-semibold">Recommend Rejection</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The Producer sees “Decision pending.” Only Admin can confirm final
              rejection.
            </p>
            <DecisionActionForm
              action={recommendRejectDecisionAction}
              label="Recommend Rejection"
              variant="destructive"
              className="mt-4"
            >
              <HiddenDecision packet={packet} />
              <label className="block text-sm font-medium">
                Reason category
                <select name="reasonCategory" className={inputClass}>
                  <option value="quality">Quality</option>
                  <option value="rights">Rights</option>
                  <option value="copyright">Copyright</option>
                  <option value="policy">Policy</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="mt-3 block text-sm font-medium">
                Internal reason
                <textarea
                  name="internalReason"
                  rows={4}
                  required
                  className={inputClass}
                />
              </label>
            </DecisionActionForm>
          </article>
        ) : null}
      </div>
    </section>
  );
}
