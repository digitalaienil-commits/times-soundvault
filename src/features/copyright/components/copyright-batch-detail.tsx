import { Button } from "@/components/ui/button";
import type { CopyrightBatchDto } from "@/types/copyright";

import {
  markRemainingNoClaimAction,
  recordBatchVideoAction,
  recordObservationAction,
} from "../actions";
import { StatusLabel } from "./status-label";

function formatTimestamp(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CopyrightBatchDetail({ batch }: { batch: CopyrightBatchDto }) {
  const remainingItemCount = batch.items.filter(
    (item) => !item.observationType,
  ).length;
  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Operational test package</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {batch.itemCount} Tracks ·{" "}
              {formatTimestamp(batch.totalDurationMs)} total ·{" "}
              {batch.gapDurationMs / 1000}s gaps
            </p>
          </div>
          <StatusLabel value={batch.status} />
        </div>
        <p className="mt-4 rounded-lg bg-muted p-4 text-sm font-medium">
          Test batches are operational copyright-check files only. They must
          never be registered as Content ID references.
        </p>
        {batch.status === "ready" ||
        batch.status === "manual_review" ||
        batch.status === "completed" ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild>
              <a href={`/api/copyright/batches/${batch.id}/download`}>
                Download private MP4
              </a>
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Run the copyright worker to build the queued private MP4 and
            manifest.
          </p>
        )}
      </section>

      <section
        aria-labelledby="video-id-title"
        className="rounded-xl border border-border bg-surface p-5"
      >
        <h2 id="video-id-title" className="text-lg font-semibold">
          Manual YouTube upload
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          After a human uploads privately to the approved account, record only
          the 11-character video ID. SoundVault will not fetch the URL.
        </p>
        <form
          action={recordBatchVideoAction}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="batchId" value={batch.id} />
          <label className="grid flex-1 gap-1.5 text-sm">
            <span>YouTube video ID</span>
            <input
              name="youtubeVideoId"
              required
              pattern="[A-Za-z0-9_-]{11}"
              defaultValue={batch.youtubeVideoId ?? ""}
              className="min-h-10 rounded-lg border border-input bg-background px-3"
            />
          </label>
          <Button type="submit">Record manual video ID</Button>
        </form>
      </section>

      <section
        aria-labelledby="results-title"
        className="rounded-xl border border-border bg-surface p-5"
      >
        <h2 id="results-title" className="text-lg font-semibold">
          Track observations
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Record only what a Coordinator or Admin actually observed in YouTube
          Studio or Content Manager.
        </p>
        <div className="mt-5 space-y-4">
          {batch.items.map((item) => (
            <article
              key={item.id}
              className="rounded-lg border border-border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {item.sequence}. {item.title}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatTimestamp(item.startMs)}–
                    {formatTimestamp(item.endMs)}
                  </p>
                </div>
                <StatusLabel value={item.observationType} />
              </div>
              <form
                action={recordObservationAction}
                className="mt-4 grid gap-3 sm:grid-cols-2"
              >
                <input type="hidden" name="batchId" value={batch.id} />
                <input
                  type="hidden"
                  name="copyrightCheckId"
                  value={item.copyrightCheckId}
                />
                <input type="hidden" name="batchItemId" value={item.id} />
                <input
                  type="hidden"
                  name="youtubeVideoId"
                  value={batch.youtubeVideoId ?? ""}
                />
                <label className="grid gap-1.5 text-sm">
                  <span>Observed result</span>
                  <select
                    name="observationType"
                    required
                    className="min-h-10 rounded-lg border border-input bg-background px-3"
                  >
                    <option value="">Select result</option>
                    <option value="no_claim">No claim observed</option>
                    <option value="content_id_claim">
                      Content ID claim observed
                    </option>
                    <option value="existing_internal_reference">
                      Existing internal reference
                    </option>
                    <option value="ownership_conflict">
                      Ownership conflict
                    </option>
                    <option value="reference_overlap">Reference overlap</option>
                    <option value="copyright_strike">
                      Copyright strike observed
                    </option>
                    <option value="inconclusive">Inconclusive</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span>Claim ID (if visible)</span>
                  <input
                    name="youtubeClaimId"
                    maxLength={200}
                    className="min-h-10 rounded-lg border border-input bg-background px-3"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span>Claimant (if visible)</span>
                  <input
                    name="claimantName"
                    maxLength={200}
                    className="min-h-10 rounded-lg border border-input bg-background px-3"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span>Asset ID (if visible)</span>
                  <input
                    name="youtubeAssetId"
                    maxLength={200}
                    className="min-h-10 rounded-lg border border-input bg-background px-3"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span>Reference ID (if visible)</span>
                  <input
                    name="youtubeReferenceId"
                    maxLength={200}
                    className="min-h-10 rounded-lg border border-input bg-background px-3"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span>Claim status</span>
                  <select
                    name="claimStatus"
                    className="min-h-10 rounded-lg border border-input bg-background px-3"
                  >
                    <option value="">Not available</option>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="inactive">Inactive</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span>Claim policy</span>
                  <select
                    name="claimPolicy"
                    className="min-h-10 rounded-lg border border-input bg-background px-3"
                  >
                    <option value="">Not available</option>
                    <option value="monetize">Monetize</option>
                    <option value="track">Track</option>
                    <option value="block">Block</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span>Match start (seconds)</span>
                  <input
                    name="matchStartSeconds"
                    type="number"
                    min="0"
                    step="0.001"
                    inputMode="decimal"
                    className="min-h-10 rounded-lg border border-input bg-background px-3"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span>Match end (seconds)</span>
                  <input
                    name="matchEndSeconds"
                    type="number"
                    min="0"
                    step="0.001"
                    inputMode="decimal"
                    className="min-h-10 rounded-lg border border-input bg-background px-3"
                  />
                </label>
                <label className="grid gap-1.5 text-sm sm:col-span-2">
                  <span>Observation note</span>
                  <textarea
                    name="notes"
                    maxLength={4000}
                    className="min-h-24 rounded-lg border border-input bg-background p-3"
                  />
                </label>
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="strikeConfirmed"
                    value="yes"
                    className="mt-1 size-4 accent-primary"
                  />
                  <span>
                    I confirm this was a copyright strike/removal event, not an
                    ordinary Content ID claim. Required only for strike
                    observations.
                  </span>
                </label>
                <Button
                  type="submit"
                  className="sm:col-span-2 sm:justify-self-start"
                >
                  Record observation
                </Button>
              </form>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                No Content ID claim observed means only that no claim was seen
                on this test upload. It does not prove copyright ownership or
                guarantee that future claims will not appear.
              </p>
            </article>
          ))}
        </div>
        {remainingItemCount > 0 && batch.youtubeVideoId ? (
          <form
            action={markRemainingNoClaimAction}
            className="mt-5 rounded-lg border border-border bg-muted p-4"
          >
            <input type="hidden" name="batchId" value={batch.id} />
            <p className="font-medium">
              Mark {remainingItemCount} remaining item
              {remainingItemCount === 1 ? "" : "s"} as no claim observed
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This only affects items without an observation and never
              overwrites a claim, conflict, or strike. It does not establish
              ownership or guarantee that a future claim will not appear.
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="noClaimConfirmed"
                value="yes"
                required
                className="mt-1 size-4 accent-primary"
              />
              <span>
                I confirm no Content ID claim was observed for every remaining
                timestamp in this manual test.
              </span>
            </label>
            <Button type="submit" variant="secondary" className="mt-3">
              Mark remaining items as no claim observed
            </Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
