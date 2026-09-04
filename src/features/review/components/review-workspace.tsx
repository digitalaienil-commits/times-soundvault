import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/types/auth";
import type { ReviewAggregate, ReviewFieldName } from "@/types/review";
import { REVIEW_FIELD_NAMES } from "@/types/review";

import {
  addReviewNoteAction,
  markReadyAction,
  reassignReviewAction,
  releaseReviewAction,
  reopenReviewAction,
  saveChecklistAction,
  saveReviewFieldAction,
  saveReviewTermAction,
  startReviewAction,
} from "../actions";
import { ReviewActionForm } from "./review-action-form";
import { ReviewAudioList } from "./review-audio-list";

const FIELD_LABELS: Record<ReviewFieldName, string> = {
  title: "Title",
  description: "Description",
  bpm: "BPM",
  keyTonic: "Key tonic",
  keyMode: "Key mode",
  timeSignature: "Time signature",
  energyScore: "Energy",
  valence: "Valence",
  arousal: "Arousal",
  vocalState: "Vocal state",
  languageCode: "Language",
  era: "Era",
  descriptionCaption: "Description / caption",
  format: "Format",
  underDialogue: "Under dialogue",
  loopable: "Loopable",
  endingType: "Ending type",
};

const SOURCE_KEYS: Record<
  ReviewFieldName,
  { producer: string; embedded: string; ai: string }
> = {
  title: { producer: "workingTitle", embedded: "title", ai: "title" },
  description: {
    producer: "description",
    embedded: "description",
    ai: "description",
  },
  bpm: { producer: "bpm", embedded: "bpm", ai: "bpm" },
  keyTonic: { producer: "keyTonic", embedded: "keyTonic", ai: "key" },
  keyMode: { producer: "keyMode", embedded: "keyMode", ai: "key" },
  timeSignature: {
    producer: "timeSignature",
    embedded: "timeSignature",
    ai: "time_signature",
  },
  energyScore: {
    producer: "energyScore",
    embedded: "energyScore",
    ai: "energy",
  },
  valence: { producer: "valence", embedded: "valence", ai: "valence" },
  arousal: { producer: "arousal", embedded: "arousal", ai: "arousal" },
  vocalState: {
    producer: "vocalState",
    embedded: "vocalState",
    ai: "vocal_state",
  },
  languageCode: {
    producer: "languageCode",
    embedded: "languageCode",
    ai: "language_code",
  },
  era: { producer: "era", embedded: "era", ai: "musical_era" },
  descriptionCaption: {
    producer: "descriptionCaption",
    embedded: "descriptionCaption",
    ai: "transformer_caption",
  },
  format: { producer: "format", embedded: "format", ai: "format" },
  underDialogue: {
    producer: "underDialogue",
    embedded: "underDialogue",
    ai: "under_dialogue",
  },
  loopable: { producer: "loopable", embedded: "loopable", ai: "loopable" },
  endingType: {
    producer: "endingType",
    embedded: "endingType",
    ai: "ending_type",
  },
};

function shown(value: unknown): string {
  if (value == null || value === "") return "Not available";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return "Structured value";
  return String(value).replaceAll("_", " ");
}

function sourceValue(
  aggregate: ReviewAggregate,
  field: ReviewFieldName,
  source: "producer" | "embedded" | "ai",
) {
  const value = aggregate.sources[source][SOURCE_KEYS[field][source]];
  if (
    (field === "keyTonic" || field === "keyMode") &&
    source === "ai" &&
    typeof value === "string"
  ) {
    return value.split(/\s+/, 2)[field === "keyTonic" ? 0 : 1] ?? null;
  }
  return value;
}

function HiddenCase({ aggregate }: { aggregate: ReviewAggregate }) {
  const review = aggregate.reviewCase!;
  return (
    <>
      <input type="hidden" name="reviewCaseId" value={review.id} />
      <input type="hidden" name="rowVersion" value={review.rowVersion} />
      <input type="hidden" name="submissionId" value={aggregate.submissionId} />
    </>
  );
}

function MetadataReview({ aggregate }: { aggregate: ReviewAggregate }) {
  const review = aggregate.reviewCase;
  return (
    <section
      aria-labelledby="metadata-review-title"
      className="rounded-xl border border-border bg-surface p-5 sm:p-7"
    >
      <h2
        id="metadata-review-title"
        className="text-xl font-semibold text-foreground"
      >
        Metadata review
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Compare immutable source values and save a separate Coordinator draft
        with provenance.
      </p>
      {aggregate.aiStatus === "disabled" ||
      aggregate.aiStatus === "not_started" ? (
        <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          AI analysis not configured
        </p>
      ) : aggregate.aiStatus === "failed" ? (
        <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          AI analysis unavailable
        </p>
      ) : aggregate.aiStatus === "skipped_unsupported_duration" ? (
        <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          AI analysis skipped — duration not supported
        </p>
      ) : null}
      <div className="mt-6 space-y-4">
        {REVIEW_FIELD_NAMES.map((field) => {
          const draft = aggregate.draft[field];
          const values = (["producer", "embedded", "ai"] as const).map(
            (source) => ({
              source,
              value: sourceValue(aggregate, field, source),
            }),
          );
          return (
            <article
              key={field}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-foreground">
                    {FIELD_LABELS[field]}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Draft: {draft ? shown(draft.value) : "Not reviewed"}
                    {draft ? ` · ${draft.sourceKind.replaceAll("_", " ")}` : ""}
                  </p>
                </div>
                {draft ? (
                  <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-foreground">
                    Reviewed
                  </span>
                ) : null}
              </div>
              <dl className="mt-4 grid gap-2 sm:grid-cols-3">
                {values
                  .filter(({ value }) => value != null && value !== "")
                  .map(({ source, value }) => (
                    <div key={source} className="rounded-md bg-muted p-3">
                      <dt className="text-xs font-medium text-muted-foreground">
                        {source === "ai"
                          ? "AI suggestion"
                          : source[0]!.toUpperCase() + source.slice(1)}
                      </dt>
                      <dd className="mt-1 text-sm text-foreground">
                        {shown(value)}
                      </dd>
                    </div>
                  ))}
              </dl>
              {aggregate.editable && review ? (
                <ReviewActionForm
                  action={saveReviewFieldAction}
                  label="Save field"
                  variant="outline"
                  className="mt-4"
                >
                  <HiddenCase aggregate={aggregate} />
                  <input type="hidden" name="fieldName" value={field} />
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                    <label className="text-xs font-medium text-muted-foreground">
                      Source
                      <select
                        name="sourceKind"
                        defaultValue={draft?.sourceKind ?? "coordinator"}
                        className="mt-1.5 h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm text-foreground"
                      >
                        {values
                          .filter(({ value }) => value != null && value !== "")
                          .map(({ source }) => (
                            <option key={source} value={source}>
                              {source === "ai"
                                ? "AI suggestion"
                                : `Use ${source} value`}
                            </option>
                          ))}
                        <option value="coordinator">Coordinator value</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium text-muted-foreground">
                      Coordinator value
                      <input
                        name="customValue"
                        defaultValue={
                          draft?.sourceKind === "coordinator"
                            ? String(draft.value ?? "")
                            : ""
                        }
                        className="mt-1.5 h-9 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground"
                      />
                    </label>
                  </div>
                </ReviewActionForm>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TaxonomyReview({ aggregate }: { aggregate: ReviewAggregate }) {
  const review = aggregate.reviewCase;
  const groups = Map.groupBy(aggregate.taxonomyTerms, (term) => term.category);
  return (
    <section
      aria-labelledby="taxonomy-title"
      className="rounded-xl border border-border bg-surface p-5 sm:p-7"
    >
      <h2 id="taxonomy-title" className="text-xl font-semibold text-foreground">
        Controlled taxonomy
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Selections stay in the review draft. Source suggestions remain
        unchanged.
      </p>
      <div className="mt-5 space-y-5">
        {[...groups.entries()].map(([category, terms]) => (
          <div key={category}>
            <h3 className="text-sm font-semibold text-foreground capitalize">
              {category.replaceAll("_", " ")}
            </h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {terms.map((term) => (
                <li
                  key={term.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {term.label}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {term.sourceKind
                          ? `${term.sourceKind === "ai" ? "AI suggestion" : term.sourceKind} source`
                          : "Active taxonomy term"}
                        {term.confidence != null
                          ? ` · confidence ${Math.round(term.confidence * 100)}%`
                          : ""}
                      </p>
                    </div>
                    {term.decision ? (
                      <span className="rounded-full bg-muted px-2 py-1 text-xs capitalize">
                        {term.decision}
                      </span>
                    ) : null}
                  </div>
                  {aggregate.editable && review ? (
                    <ReviewActionForm
                      action={saveReviewTermAction}
                      label="Save term"
                      variant="outline"
                      className="mt-3"
                    >
                      <HiddenCase aggregate={aggregate} />
                      <input type="hidden" name="termId" value={term.id} />
                      <input
                        type="hidden"
                        name="sourceKind"
                        value={term.sourceKind ?? "coordinator"}
                      />
                      <select
                        name="decision"
                        aria-label={`Decision for ${term.label}`}
                        defaultValue={term.decision ?? "selected"}
                        className="mb-2 h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm"
                      >
                        <option value="selected">Select</option>
                        <option value="rejected">Reject suggestion</option>
                      </select>
                    </ReviewActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function TechnicalReview({ aggregate }: { aggregate: ReviewAggregate }) {
  return (
    <section
      aria-labelledby="technical-title"
      className="rounded-xl border border-border bg-surface p-5 sm:p-7"
    >
      <h2
        id="technical-title"
        className="text-xl font-semibold text-foreground"
      >
        Technical QC
      </h2>
      <div className="mt-5 space-y-4">
        {aggregate.audioFiles.map((file) => (
          <article
            key={file.id}
            className="rounded-lg border border-border bg-background p-4"
          >
            <h3 className="font-medium text-foreground">{file.label}</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
              {[
                [
                  "Duration",
                  file.durationMs == null
                    ? null
                    : `${(file.durationMs / 1000).toFixed(1)} s`,
                ],
                ["Codec", file.codec],
                [
                  "Bitrate",
                  file.bitRateBps == null
                    ? null
                    : `${Math.round(file.bitRateBps / 1000)} kbps`,
                ],
                [
                  "Layout",
                  file.channelLayout ??
                    (file.channels == null
                      ? null
                      : `${file.channels} channels`),
                ],
                [
                  "Loudness",
                  file.integratedLoudnessLufs == null
                    ? null
                    : `${file.integratedLoudnessLufs} LUFS`,
                ],
                [
                  "Loudness range",
                  file.loudnessRangeLu == null
                    ? null
                    : `${file.loudnessRangeLu} LU`,
                ],
                [
                  "True peak",
                  file.truePeakDbtp == null
                    ? null
                    : `${file.truePeakDbtp} dBTP`,
                ],
                [
                  "Silence",
                  file.leadingSilenceMs == null &&
                  file.trailingSilenceMs == null
                    ? null
                    : `${file.leadingSilenceMs ?? 0} / ${file.trailingSilenceMs ?? 0} ms`,
                ],
              ].map(([name, value]) => (
                <div key={name}>
                  <dt className="text-xs text-muted-foreground">{name}</dt>
                  <dd className="mt-1 text-foreground">
                    {value ?? "Not available"}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <div className="mt-5">
        <h3 className="font-medium text-foreground">QC issues</h3>
        {aggregate.qcIssues.length ? (
          <ul className="mt-2 space-y-2">
            {aggregate.qcIssues.map((issue) => (
              <li
                key={issue.id}
                className="rounded-lg bg-muted p-3 text-sm text-foreground"
              >
                <span className="font-medium capitalize">{issue.severity}</span>{" "}
                · {issue.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No technical QC issues recorded.
          </p>
        )}
      </div>
    </section>
  );
}

function RightsCopyright({ aggregate }: { aggregate: ReviewAggregate }) {
  return (
    <section
      aria-labelledby="rights-title"
      className="rounded-xl border border-border bg-surface p-5 sm:p-7"
    >
      <h2 id="rights-title" className="text-xl font-semibold text-foreground">
        Rights &amp; copyright
      </h2>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {["Declared rights", "YouTube copyright & Content ID"].map(
          (title, index) => {
            const data = index === 0 ? aggregate.rights : aggregate.copyright;
            return (
              <article
                key={title}
                className="rounded-lg border border-border bg-background p-4"
              >
                <h3 className="font-medium text-foreground">{title}</h3>
                {data ? (
                  <dl className="mt-3 space-y-2 text-sm">
                    {Object.entries(data)
                      .filter(([, value]) => value != null && value !== "")
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between gap-4 border-b border-border pb-2 last:border-0"
                        >
                          <dt className="text-muted-foreground">
                            {key
                              .replace(/([A-Z])/g, " $1")
                              .replaceAll("_", " ")}
                          </dt>
                          <dd className="text-right text-foreground">
                            {shown(value)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No record is available.
                  </p>
                )}
                {index === 1 && data?.outcome === "no_claim_observed" ? (
                  <p className="mt-4 rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
                    No Content ID claim was observed on the recorded test. This
                    does not prove copyright ownership or guarantee that future
                    claims will not appear.
                  </p>
                ) : null}
              </article>
            );
          },
        )}
      </div>
    </section>
  );
}

function Notes({ aggregate }: { aggregate: ReviewAggregate }) {
  const review = aggregate.reviewCase;
  return (
    <section
      aria-labelledby="notes-title"
      className="rounded-xl border border-border bg-surface p-5 sm:p-7"
    >
      <h2 id="notes-title" className="text-xl font-semibold text-foreground">
        Internal notes
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Append-only notes visible only to the review team.
      </p>
      {aggregate.editable && review ? (
        <ReviewActionForm
          action={addReviewNoteAction}
          label="Add note"
          className="mt-5"
        >
          <HiddenCase aggregate={aggregate} />
          <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <label className="text-xs font-medium text-muted-foreground">
              Category
              <select
                name="category"
                className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              >
                {["general", "audio", "metadata", "rights", "copyright"].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Note
              <textarea
                name="body"
                required
                rows={3}
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
        </ReviewActionForm>
      ) : null}
      <ul className="mt-5 space-y-3">
        {aggregate.notes.map((note) => (
          <li
            key={note.id}
            className="rounded-lg border border-border bg-background p-4"
          >
            <p className="text-xs font-medium text-muted-foreground capitalize">
              {note.category} · {note.authorName}
            </p>
            <p className="mt-2 text-sm whitespace-pre-wrap text-foreground">
              {note.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewRail({
  aggregate,
  user,
}: {
  aggregate: ReviewAggregate;
  user: CurrentUser;
}) {
  const review = aggregate.reviewCase;
  if (!review) {
    return (
      <aside className="rounded-xl border border-border bg-surface p-5 xl:sticky xl:top-6 xl:self-start">
        <h2 className="font-semibold text-foreground">Review not started</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Claim this revision to create its Coordinator review draft.
        </p>
        <form action={startReviewAction} className="mt-4">
          <input
            type="hidden"
            name="submissionId"
            value={aggregate.submissionId}
          />
          <Button type="submit" className="w-full">
            Start / claim review
          </Button>
        </form>
      </aside>
    );
  }
  const completeCount = aggregate.checklist.filter(
    (item) => item.status !== "pending",
  ).length;
  return (
    <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-foreground">Review progress</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {completeCount} of {aggregate.checklist.length} checklist areas
          reviewed
        </p>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          aria-hidden="true"
        >
          <div
            className="h-full bg-brand"
            style={{
              width: `${aggregate.checklist.length ? (completeCount / aggregate.checklist.length) * 100 : 0}%`,
            }}
          />
        </div>
        <p className="mt-4 text-sm text-foreground">
          {review.status === "ready_for_decision"
            ? "Ready for decision"
            : review.assignedToName
              ? `Assigned to ${review.assignedToName}`
              : "Unassigned"}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-foreground">Checklist</h2>
        <div className="mt-4 space-y-3">
          {aggregate.checklist.map((item) => (
            <div
              key={item.code}
              className="rounded-lg border border-border bg-background p-3"
            >
              <p className="text-sm font-medium text-foreground capitalize">
                {item.code.replaceAll("_", " ")}
              </p>
              {aggregate.editable ? (
                <ReviewActionForm
                  action={saveChecklistAction}
                  label="Save"
                  variant="outline"
                  className="mt-2"
                >
                  <HiddenCase aggregate={aggregate} />
                  <input type="hidden" name="code" value={item.code} />
                  <select
                    name="status"
                    aria-label={`Status for ${item.code.replaceAll("_", " ")}`}
                    defaultValue={item.status}
                    className="mb-2 h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm"
                  >
                    <option value="pending">Pending</option>
                    <option value="pass">Pass</option>
                    <option value="attention">Attention</option>
                    <option value="not_applicable">Not applicable</option>
                  </select>
                  <input
                    name="note"
                    defaultValue={item.note ?? ""}
                    placeholder="Required for attention"
                    className="mb-2 h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm"
                  />
                </ReviewActionForm>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground capitalize">
                  {item.status.replaceAll("_", " ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {user.role === "admin" && review.status === "in_progress" ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-semibold text-foreground">Assignment</h2>
          <ReviewActionForm
            action={reassignReviewAction}
            label="Reassign"
            variant="outline"
            className="mt-3"
          >
            <HiddenCase aggregate={aggregate} />
            <select
              name="assigneeUserId"
              aria-label="Select reviewer"
              defaultValue={review.assignedToUserId ?? ""}
              className="mb-3 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
            >
              <option value="" disabled>
                Select reviewer
              </option>
              {aggregate.eligibleReviewers.map((reviewer) => (
                <option key={reviewer.id} value={reviewer.id}>
                  {reviewer.name} · {reviewer.role}
                </option>
              ))}
            </select>
          </ReviewActionForm>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-foreground">Decision handoff</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Section 7 locks the review draft. The Submission remains in review for
          the next section.
        </p>
        {review.status === "ready_for_decision" ? (
          user.role === "admin" || review.assignedToUserId === user.id ? (
            <ReviewActionForm
              action={reopenReviewAction}
              label="Reopen review"
              variant="outline"
              className="mt-4"
            >
              <HiddenCase aggregate={aggregate} />
            </ReviewActionForm>
          ) : null
        ) : aggregate.editable ? (
          <ReviewActionForm
            action={markReadyAction}
            label="Mark ready for decision"
            className="mt-4"
          >
            <HiddenCase aggregate={aggregate} />
          </ReviewActionForm>
        ) : null}
      </section>
    </aside>
  );
}

export function ReviewWorkspace({
  aggregate,
  user,
}: {
  aggregate: ReviewAggregate;
  user: CurrentUser;
}) {
  const review = aggregate.reviewCase;
  return (
    <>
      <header className="border-b border-border pb-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              Coordinator review workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
              {aggregate.trackTitle}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Revision {aggregate.revisionNumber} · Music Producer:{" "}
              {aggregate.producerName} · Status:{" "}
              {aggregate.submissionStatus.replaceAll("_", " ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/review">Back to review queue</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/submissions/${aggregate.submissionId}`}>
                Submission detail
              </Link>
            </Button>
            {review &&
            review.status === "in_progress" &&
            (user.role === "admin" || review.assignedToUserId === user.id) ? (
              <form action={releaseReviewAction}>
                <HiddenCase aggregate={aggregate} />
                <Button type="submit" variant="outline">
                  Release review
                </Button>
              </form>
            ) : null}
          </div>
        </div>
        {!aggregate.editable && review?.status === "in_progress" ? (
          <p className="mt-5 rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
            This review is assigned to{" "}
            {review.assignedToName ?? "another reviewer"}. You can inspect it
            read-only.
          </p>
        ) : null}
      </header>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="space-y-6">
          <section
            aria-labelledby="audio-review-title"
            className="rounded-xl border border-border bg-surface p-5 sm:p-7"
          >
            <h2
              id="audio-review-title"
              className="text-xl font-semibold text-foreground"
            >
              Audio review
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Secure review-only preview. Playback is never automatic.
            </p>
            <div className="mt-5">
              <ReviewAudioList files={aggregate.audioFiles} />
            </div>
          </section>
          <MetadataReview aggregate={aggregate} />
          <TaxonomyReview aggregate={aggregate} />
          <TechnicalReview aggregate={aggregate} />
          <RightsCopyright aggregate={aggregate} />
          <Notes aggregate={aggregate} />
        </main>
        <ReviewRail aggregate={aggregate} user={user} />
      </div>
    </>
  );
}
