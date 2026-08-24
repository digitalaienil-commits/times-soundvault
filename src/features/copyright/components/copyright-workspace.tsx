import Link from "next/link";

import { Button } from "@/components/ui/button";
import type {
  CopyrightBatchListItem,
  CopyrightCheckListItem,
} from "@/types/copyright";

import {
  createCopyrightBatchAction,
  recordReferenceLinkAction,
  reopenCopyrightCheckAction,
  reviewEligibilityAction,
} from "../actions";
import { StatusLabel } from "./status-label";

const QUESTION_LABELS = {
  exclusiveMasterRights: "Exclusive master rights controlled?",
  compositionRights: "Required composition rights controlled?",
  nonExclusiveComponents: "Any non-exclusive component?",
  thirdPartySamplesOrLoops: "Third-party samples or loops?",
  sufficientlyDistinct: "Content sufficiently distinct?",
  individualMusicalWork: "Individual musical work?",
  genericProductionAudio: "Generic production audio or soundbed?",
  ownershipTerritoryKnown: "Ownership territory known?",
  ownershipPeriodKnown: "Ownership period known?",
  identificationMetadataAvailable: "Identification metadata available?",
  existingYouTubeReferenceKnown: "Existing YouTube reference known?",
  manualPolicyReviewRequired: "Manual policy review required?",
} as const;

export function CopyrightWorkspace({
  checks,
  batches,
  providerReason,
  canAdminister,
}: {
  checks: CopyrightCheckListItem[];
  batches: CopyrightBatchListItem[];
  providerReason: string;
  canAdminister: boolean;
}) {
  const selectable = checks.filter(
    (check) => check.status === "ready" && check.technicalStatus === "complete",
  );
  const selectableIds = new Set(selectable.map((check) => check.id));
  return (
    <div className="mt-8 space-y-6">
      <section
        aria-labelledby="manual-mode-title"
        className="rounded-xl border border-border bg-surface p-5 shadow-soft"
      >
        <p className="text-xs font-semibold tracking-[0.14em] text-brand uppercase">
          Manual mode
        </p>
        <h2 id="manual-mode-title" className="mt-2 text-lg font-semibold">
          Manual YouTube check
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {providerReason} SoundVault does not contact YouTube or retrieve
          claims.
        </p>
        <p className="mt-3 text-sm font-medium">
          Test batches are operational copyright-check files only. They must
          never be registered as Content ID references.
        </p>
      </section>

      <section
        aria-labelledby="batch-history-title"
        className="rounded-xl border border-border bg-surface p-5"
      >
        <h2 id="batch-history-title" className="text-lg font-semibold">
          Test batch history
        </h2>
        {batches.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No operational test batches have been created.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {batches.map((batch) => (
              <li
                key={batch.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {batch.itemCount} Tracks ·{" "}
                    {Math.round(batch.totalDurationMs / 1000)} seconds
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created{" "}
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(batch.createdAt))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusLabel value={batch.status} />
                  <Button asChild variant="outline">
                    <Link href={`/copyright/batches/${batch.id}`}>
                      Open batch
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="checks-title"
        className="rounded-xl border border-border bg-surface p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="checks-title" className="text-lg font-semibold">
              Current checks
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select technically complete Masters to prepare a private test
              batch.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {checks.length} current checks
          </p>
        </div>
        {checks.length === 0 ? (
          <p className="mt-6 rounded-lg bg-muted p-4 text-sm">
            No submitted Revisions need a copyright check yet.
          </p>
        ) : (
          <div className="mt-5">
            <form
              id="copyright-batch-form"
              action={createCopyrightBatchAction}
            />
            <div className="space-y-3">
              {checks.map((check) => {
                const canSelect = selectableIds.has(check.id);
                return (
                  <article
                    key={check.id}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="grid gap-4 lg:grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center">
                      <input
                        type="checkbox"
                        name="checkId"
                        form="copyright-batch-form"
                        value={check.id}
                        disabled={!canSelect}
                        aria-label={`Select ${check.title} for a test batch`}
                        className="size-5 accent-primary"
                      />
                      <div>
                        <h3 className="font-semibold">{check.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {check.ownerName} · Revision {check.revisionNumber} ·{" "}
                          {check.technicalStatus.replaceAll("_", " ")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusLabel value={check.status} />
                        <StatusLabel value={check.eligibilityStatus} />
                        <StatusLabel value={check.outcome} />
                      </div>
                      <div className="flex gap-2">
                        <Button asChild variant="outline">
                          <Link href={`/submissions/${check.submissionId}`}>
                            Open
                          </Link>
                        </Button>
                      </div>
                    </div>
                    <details className="mt-4 border-t border-border pt-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        Content ID eligibility checklist
                      </summary>
                      <form
                        action={reviewEligibilityAction}
                        className="mt-4 grid gap-4 sm:grid-cols-2"
                      >
                        <input
                          type="hidden"
                          name="copyrightCheckId"
                          value={check.id}
                        />
                        {Object.entries(QUESTION_LABELS).map(
                          ([name, label]) => (
                            <label key={name} className="grid gap-1.5 text-sm">
                              <span>{label}</span>
                              <select
                                name={name}
                                defaultValue="unknown"
                                className="min-h-10 rounded-lg border border-input bg-background px-3"
                              >
                                <option value="unknown">Unknown</option>
                                <option value="yes">Yes</option>
                                <option value="no">No</option>
                              </select>
                            </label>
                          ),
                        )}
                        <label className="grid gap-1.5 text-sm sm:col-span-2">
                          <span>Review note (not legal advice)</span>
                          <textarea
                            name="note"
                            maxLength={4000}
                            className="min-h-24 rounded-lg border border-input bg-background p-3"
                          />
                        </label>
                        <Button
                          type="submit"
                          className="sm:col-span-2 sm:justify-self-start"
                        >
                          Save eligibility review
                        </Button>
                      </form>
                      {canAdminister ? (
                        <div className="mt-5 grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
                          <form
                            action={recordReferenceLinkAction}
                            className="grid gap-3 rounded-lg bg-muted p-4"
                          >
                            <input
                              type="hidden"
                              name="copyrightCheckId"
                              value={check.id}
                            />
                            <h4 className="font-medium">
                              Record existing reference
                            </h4>
                            <label className="grid gap-1 text-sm">
                              <span>YouTube reference ID</span>
                              <input
                                name="referenceId"
                                required
                                maxLength={200}
                                className="min-h-10 rounded-lg border border-input bg-background px-3"
                              />
                            </label>
                            <label className="grid gap-1 text-sm">
                              <span>YouTube asset ID (optional)</span>
                              <input
                                name="assetId"
                                maxLength={200}
                                className="min-h-10 rounded-lg border border-input bg-background px-3"
                              />
                            </label>
                            <Button
                              type="submit"
                              variant="outline"
                              className="justify-self-start"
                            >
                              Save reference link
                            </Button>
                          </form>
                          <form
                            action={reopenCopyrightCheckAction}
                            className="grid gap-3 rounded-lg bg-muted p-4"
                          >
                            <input
                              type="hidden"
                              name="copyrightCheckId"
                              value={check.id}
                            />
                            <h4 className="font-medium">
                              Open a new check round
                            </h4>
                            <label className="grid gap-1 text-sm">
                              <span>Reason</span>
                              <textarea
                                name="reason"
                                required
                                maxLength={1000}
                                className="min-h-20 rounded-lg border border-input bg-background p-3"
                              />
                            </label>
                            <Button
                              type="submit"
                              variant="outline"
                              className="justify-self-start"
                            >
                              Reopen check
                            </Button>
                          </form>
                        </div>
                      ) : null}
                    </details>
                  </article>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                form="copyright-batch-form"
                disabled={selectable.length === 0}
              >
                Create copyright test batch
              </Button>
              <p className="text-xs text-muted-foreground">
                Maximum 20 Tracks and 90 minutes by default. Masters only.
              </p>
            </div>
          </div>
        )}
      </section>

      <aside className="rounded-xl border border-border bg-muted p-5 text-sm leading-6">
        <h2 className="font-semibold">Claim and strike are different</h2>
        <p className="mt-1 text-muted-foreground">
          Content ID claims and copyright strikes are different. A claim
          normally indicates that YouTube matched content to a rights holder. A
          strike relates to a copyright removal request.
        </p>
      </aside>
    </div>
  );
}
