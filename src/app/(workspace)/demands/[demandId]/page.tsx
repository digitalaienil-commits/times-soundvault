import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search, UploadCloud } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  acceptResponseAction,
  declineResponseAction,
  restoreResponseAction,
  removeDemandReferenceAction,
  shortlistResponseAction,
  linkExistingSubmissionAction,
  submitOrRefreshResponseAction,
  transitionDemandAction,
  unacceptResponseAction,
  withdrawResponseAction,
} from "@/features/demands/actions/demand-actions";
import { DemandActionForm } from "@/features/demands/components/demand-action-form";
import { PublishedTrackMediaActions } from "@/components/shared/published-track-media-actions";
import { hasPermission } from "@/lib/auth/permissions";
import { requireRouteFamilyAccess } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/database/database";
import {
  evaluateDemandTrack,
  getDemandDetail,
  listLinkableSubmissions,
} from "@/lib/demands/repository";

export const metadata: Metadata = { title: "Demand" };
const hidden = (demandId: string, responseId?: string, rowVersion?: number) => (
  <>
    <input type="hidden" name="demandId" value={demandId} />
    {responseId ? (
      <input type="hidden" name="responseId" value={responseId} />
    ) : null}
    {rowVersion != null ? (
      <input type="hidden" name="rowVersion" value={rowVersion} />
    ) : null}
  </>
);

export default async function DemandDetailPage({
  params,
}: {
  params: Promise<{ demandId: string }>;
}) {
  const { demandId } = await params;
  const user = await requireRouteFamilyAccess(
    "/demands/[demandId]",
    `/demands/${demandId}`,
  );
  const demand = await getDemandDetail(getDatabase(), demandId, user);
  if (!demand) notFound();
  const manage = hasPermission(user.role, "demand.manage");
  const respond = hasPermission(user.role, "demand.respond");
  const linkableSubmissions = respond
    ? await listLinkableSubmissions(getDatabase(), user, demand.id)
    : [];
  const fits = new Map(
    await Promise.all(
      demand.responses.map(
        async (response) =>
          [
            response.id,
            await evaluateDemandTrack(
              getDatabase(),
              demand.id,
              response.trackId,
            ),
          ] as const,
      ),
    ),
  );
  const queue = [
    ...demand.references
      .filter((item) => item.published)
      .map((item) => ({
        trackId: item.trackId,
        title: item.title,
        versionLabel: null,
        durationMs: item.durationMs,
      })),
    ...demand.responses
      .filter((item) => item.currentlyPublished)
      .map((item) => ({
        trackId: item.trackId,
        title: item.trackTitle,
        versionLabel: null,
        durationMs: null,
      })),
  ];
  return (
    <main>
      <Link
        href="/demands"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" />
        Back to Demand Sheet
      </Link>
      <PageHeader
        title={demand.title}
        description={`${demand.displayNumber} · ${demand.projectContext}`}
        actions={
          manage ? (
            <Button asChild variant="outline">
              <Link href={`/demands/${demand.id}/edit`}>Edit Demand</Link>
            </Button>
          ) : undefined
        }
      />
      {demand.overdue ||
      demand.fulfillmentNeedsAttention ||
      demand.assignedToCurrentUser ? (
        <section className="mt-5 space-y-2" aria-label="Demand attention">
          <div className="flex flex-wrap gap-2">
            {demand.overdue ? (
              <Badge variant="destructive">Deadline passed</Badge>
            ) : null}
            {demand.fulfillmentNeedsAttention ? (
              <Badge variant="destructive">Fulfillment needs attention</Badge>
            ) : null}
            {demand.assignedToCurrentUser ? (
              <Badge variant="secondary">Assigned to you</Badge>
            ) : null}
            {demand.readyToFulfill ? (
              <Badge variant="secondary">Ready to fulfill</Badge>
            ) : null}
          </div>
          {demand.fulfillmentNeedsAttention ? (
            <p className="text-sm text-warning">
              {demand.coverage.accepted - demand.coverage.validAccepted}{" "}
              accepted Track is no longer current and published.
            </p>
          ) : null}
        </section>
      ) : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-semibold">
              Brief{" "}
              <span className="font-normal text-muted-foreground">
                v{demand.briefVersion}
              </span>
            </h2>
            <p className="mt-4 leading-7 whitespace-pre-wrap">{demand.brief}</p>
            {demand.creativeNotes ? (
              <>
                <h3 className="mt-5 text-sm font-semibold">Creative notes</h3>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                  {demand.creativeNotes}
                </p>
              </>
            ) : null}
            {demand.avoidNotes ? (
              <>
                <h3 className="mt-5 text-sm font-semibold">Avoid</h3>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                  {demand.avoidNotes}
                </p>
              </>
            ) : null}
          </section>
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Requirements</h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Required</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {demand.requirements
                    .filter((item) => item.importance === "required")
                    .map((item) => (
                      <li
                        key={item.id}
                        className={item.active ? "" : "text-destructive"}
                      >
                        {item.label}
                        {item.active
                          ? ""
                          : " — Inactive requirement — update the Demand"}
                      </li>
                    ))}
                  <li>Asset: {demand.assetKind.replaceAll("_", " ")}</li>
                  {demand.vocalState ? (
                    <li>Vocal: {demand.vocalState}</li>
                  ) : null}
                  {demand.stemsRequired ? <li>Stems required</li> : null}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Preferred</h3>
                <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                  {demand.requirements
                    .filter((item) => item.importance === "preferred")
                    .map((item) => (
                      <li key={item.id}>{item.label}</li>
                    ))}
                  {!demand.requirements.some(
                    (item) => item.importance === "preferred",
                  ) ? (
                    <li>None specified</li>
                  ) : null}
                </ul>
              </div>
            </div>
          </section>
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Reference Tracks</h2>
                <p className="text-sm text-muted-foreground">
                  Creative direction only—not fulfillment responses.
                </p>
              </div>
            </div>
            {demand.references.length ? (
              <ul className="mt-4 space-y-3">
                {demand.references.map((reference) => (
                  <li
                    key={reference.id}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{reference.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {reference.format ?? "Format unavailable"} ·{" "}
                          {reference.bpm
                            ? `${reference.bpm} BPM`
                            : "BPM unavailable"}
                        </p>
                      </div>
                      {reference.published ? (
                        <PublishedTrackMediaActions
                          trackId={reference.trackId}
                          title={reference.title}
                          queue={queue}
                          playbackStatus={reference.playbackStatus}
                          masterPlaybackReady={reference.masterPlaybackReady}
                        />
                      ) : (
                        <Badge variant="destructive">
                          Reference no longer published
                        </Badge>
                      )}
                      {manage ? (
                        <DemandActionForm
                          action={removeDemandReferenceAction}
                          label="Remove reference"
                          variant="outline"
                        >
                          <input
                            type="hidden"
                            name="demandId"
                            value={demand.id}
                          />
                          <input
                            type="hidden"
                            name="trackId"
                            value={reference.trackId}
                          />
                          <input
                            type="hidden"
                            name="rowVersion"
                            value={demand.rowVersion}
                          />
                        </DemandActionForm>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No internal reference Tracks.
              </p>
            )}
          </section>
          <section
            className="rounded-xl border border-border bg-surface p-5 sm:p-6"
            aria-labelledby="responses-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="responses-heading" className="text-lg font-semibold">
                  {manage ? "Responses" : "Your responses"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {demand.coverage.validAccepted} / {demand.targetTrackCount}{" "}
                  accepted and currently valid.
                </p>
              </div>
              {demand.status === "open" && respond && !demand.overdue ? (
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={`/demands/${demand.id}/find`}>
                      <Search aria-hidden="true" />
                      Find existing music
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/upload?demandId=${demand.id}`}>
                      <UploadCloud aria-hidden="true" />
                      Create new Track for this Demand
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
            {demand.overdue ? (
              <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                The response deadline has passed. Existing responses remain
                visible; new responses are blocked.
              </p>
            ) : null}
            {demand.status === "open" &&
            !demand.overdue &&
            linkableSubmissions.length ? (
              <div className="mt-4 rounded-lg border border-border bg-muted p-4">
                <h3 className="text-sm font-semibold">
                  Link your in-progress Submission
                </h3>
                <DemandActionForm
                  action={linkExistingSubmissionAction}
                  label="Link Submission"
                  variant="outline"
                >
                  <input type="hidden" name="demandId" value={demand.id} />
                  <label className="mt-2 mb-2 grid gap-1 text-sm">
                    Submission
                    <select
                      name="submissionId"
                      required
                      className="min-h-11 w-full max-w-full min-w-0 rounded-lg border border-border bg-surface px-3"
                    >
                      {linkableSubmissions.map((item) => (
                        <option
                          key={item.submissionId}
                          value={item.submissionId}
                        >
                          {item.title} — {item.status.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </DemandActionForm>
              </div>
            ) : null}
            {demand.responses.length ? (
              <ul className="mt-5 space-y-4">
                {demand.responses.map((response) => {
                  const fit = fits.get(response.id)!;
                  return (
                    <li key={response.id}>
                      <article className="rounded-xl border border-border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">
                              <Link
                                href={`/library/${response.trackId}`}
                                className="hover:text-brand hover:underline"
                              >
                                {response.trackTitle}
                              </Link>
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {response.origin === "catalog"
                                ? "Existing catalog"
                                : `New production · ${response.submissionStatus?.replaceAll("_", " ") ?? "Draft"}`}
                              {response.responderName
                                ? ` · ${response.responderName}`
                                : ""}
                            </p>
                          </div>
                          <Badge
                            variant={
                              response.status === "accepted"
                                ? "secondary"
                                : response.status === "declined"
                                  ? "destructive"
                                  : "outline"
                            }
                          >
                            {response.status}
                          </Badge>
                        </div>
                        {response.pitchNote ? (
                          <p className="mt-3 text-sm">{response.pitchNote}</p>
                        ) : null}
                        {response.declineReason ? (
                          <p className="mt-3 rounded-lg bg-muted p-3 text-sm">
                            <strong>Coordinator feedback:</strong>{" "}
                            {response.declineReason}
                          </p>
                        ) : null}
                        {response.briefChanged ? (
                          <p className="mt-3 text-sm font-semibold text-warning">
                            Brief updated since this Track was submitted.
                          </p>
                        ) : null}
                        {response.trackChanged ? (
                          <p className="mt-3 text-sm font-semibold text-warning">
                            Track changed — refresh response.
                          </p>
                        ) : null}
                        <div className="mt-3 text-sm">
                          <p>
                            <strong>Required:</strong>{" "}
                            {fit.requiredMatches.length}/
                            {fit.requiredMatches.length +
                              fit.requiredMismatches.length}{" "}
                            satisfied
                          </p>
                          <p>
                            <strong>Preferred:</strong>{" "}
                            {fit.preferredMatches.length}/
                            {fit.preferredMatches.length +
                              fit.preferredMissing.length}{" "}
                            matched
                          </p>
                          {fit.requiredMismatches.length ? (
                            <ul className="mt-2 list-disc pl-5 text-destructive">
                              {fit.requiredMismatches.map((item) => (
                                <li key={item.code}>
                                  {item.label}: {item.actual}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div className="mt-4 flex flex-wrap items-start gap-3">
                          {response.currentlyPublished ? (
                            <PublishedTrackMediaActions
                              trackId={response.trackId}
                              title={response.trackTitle}
                              queue={queue}
                              playbackStatus={response.playbackStatus}
                              masterPlaybackReady={response.masterPlaybackReady}
                            />
                          ) : null}
                          {response.origin === "submission" &&
                          response.submissionId ? (
                            <Button asChild variant="outline">
                              <Link
                                href={`/submissions/${response.submissionId}`}
                              >
                                Open Submission
                              </Link>
                            </Button>
                          ) : null}
                          {response.status === "working" ||
                          (["submitted", "shortlisted"].includes(
                            response.status,
                          ) &&
                            (response.briefChanged ||
                              response.trackChanged)) ? (
                            <DemandActionForm
                              action={submitOrRefreshResponseAction}
                              label={
                                response.status === "working"
                                  ? "Submit to Demand"
                                  : "Refresh response"
                              }
                            >
                              {hidden(
                                demand.id,
                                response.id,
                                response.rowVersion,
                              )}
                            </DemandActionForm>
                          ) : null}
                          {["working", "submitted", "shortlisted"].includes(
                            response.status,
                          ) ? (
                            <DemandActionForm
                              action={withdrawResponseAction}
                              label="Withdraw"
                              variant="destructive"
                            >
                              {hidden(
                                demand.id,
                                response.id,
                                response.rowVersion,
                              )}
                            </DemandActionForm>
                          ) : null}
                          {manage && response.status === "submitted" ? (
                            <DemandActionForm
                              action={shortlistResponseAction}
                              label="Shortlist"
                            >
                              {hidden(
                                demand.id,
                                response.id,
                                response.rowVersion,
                              )}
                            </DemandActionForm>
                          ) : null}
                          {manage &&
                          ["submitted", "shortlisted"].includes(
                            response.status,
                          ) ? (
                            <DemandActionForm
                              action={acceptResponseAction}
                              label="Accept"
                              variant="default"
                            >
                              {hidden(
                                demand.id,
                                response.id,
                                response.rowVersion,
                              )}
                            </DemandActionForm>
                          ) : null}
                          {manage &&
                          ["submitted", "shortlisted"].includes(
                            response.status,
                          ) ? (
                            <DemandActionForm
                              action={declineResponseAction}
                              label="Decline"
                              variant="destructive"
                              requireReason
                            >
                              {hidden(
                                demand.id,
                                response.id,
                                response.rowVersion,
                              )}
                            </DemandActionForm>
                          ) : null}
                          {manage && response.status === "declined" ? (
                            <DemandActionForm
                              action={restoreResponseAction}
                              label="Restore"
                            >
                              {hidden(
                                demand.id,
                                response.id,
                                response.rowVersion,
                              )}
                            </DemandActionForm>
                          ) : null}
                          {manage &&
                          response.status === "accepted" &&
                          demand.status === "open" ? (
                            <DemandActionForm
                              action={unacceptResponseAction}
                              label="Remove acceptance"
                              variant="destructive"
                            >
                              {hidden(
                                demand.id,
                                response.id,
                                response.rowVersion,
                              )}
                            </DemandActionForm>
                          ) : null}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                No responses yet. Search existing published music before
                starting new production.
              </p>
            )}
          </section>
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Activity</h2>
            <ol className="mt-4 space-y-3">
              {demand.events.map((event) => (
                <li
                  key={event.id}
                  className="border-l-2 border-border pl-4 text-sm"
                >
                  <p className="font-medium">
                    {event.eventType.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.actorName ?? "SoundVault"} ·{" "}
                    {new Date(event.createdAt).toLocaleString("en-IN")}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{demand.status}</Badge>
              <Badge
                variant={
                  demand.priority === "urgent" ? "destructive" : "secondary"
                }
              >
                {demand.priority}
              </Badge>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Demand</dt>
                <dd className="font-mono">{demand.displayNumber}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Owner</dt>
                <dd>{demand.ownerName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Requester</dt>
                <dd>{demand.requesterName ?? "Not supplied"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Response deadline</dt>
                <dd>{demand.responseDeadlineOn}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Needed by</dt>
                <dd>{demand.neededByOn}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Target</dt>
                <dd>
                  {demand.coverage.validAccepted} / {demand.targetTrackCount}{" "}
                  accepted
                </dd>
              </div>
            </dl>
          </section>
          {manage ? (
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-semibold">Demand actions</h2>
              <div className="mt-4 space-y-4">
                {demand.status === "draft" ? (
                  <DemandActionForm
                    action={transitionDemandAction}
                    label="Open Demand"
                    variant="default"
                  >
                    {hidden(demand.id, undefined, demand.rowVersion)}
                    <input type="hidden" name="nextStatus" value="open" />
                  </DemandActionForm>
                ) : null}
                {demand.status === "open" && demand.readyToFulfill ? (
                  <DemandActionForm
                    action={transitionDemandAction}
                    label="Fulfill Demand"
                    variant="default"
                  >
                    {hidden(demand.id, undefined, demand.rowVersion)}
                    <input type="hidden" name="nextStatus" value="fulfilled" />
                  </DemandActionForm>
                ) : null}
                {demand.status === "open" ? (
                  <>
                    <DemandActionForm
                      action={transitionDemandAction}
                      label="Close Demand"
                      requireReason
                    >
                      {hidden(demand.id, undefined, demand.rowVersion)}
                      <input type="hidden" name="nextStatus" value="closed" />
                    </DemandActionForm>
                    <DemandActionForm
                      action={transitionDemandAction}
                      label="Cancel Demand"
                      variant="destructive"
                      requireReason
                    >
                      {hidden(demand.id, undefined, demand.rowVersion)}
                      <input
                        type="hidden"
                        name="nextStatus"
                        value="cancelled"
                      />
                    </DemandActionForm>
                  </>
                ) : null}
                {["closed", "fulfilled"].includes(demand.status) ? (
                  <DemandActionForm
                    action={transitionDemandAction}
                    label="Reopen Demand"
                    requireReason
                  >
                    {hidden(demand.id, undefined, demand.rowVersion)}
                    <input type="hidden" name="nextStatus" value="open" />
                  </DemandActionForm>
                ) : null}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
