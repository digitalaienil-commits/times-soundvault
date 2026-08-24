import type { RightsDeclarationDto } from "@/types/domain/rights";
import type { UploadWorkspaceSubmission } from "@/types/uploads";

import { formatBytes } from "./batch-summary";
import { SubmissionActions } from "./submission-actions";

interface EventItem {
  id: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
}

export function UploadSubmissionDetail({
  submission,
  rights,
  events,
  canMutate,
}: {
  submission: UploadWorkspaceSubmission;
  rights: RightsDeclarationDto | null;
  events: EventItem[];
  canMutate: boolean;
}) {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <section
          aria-labelledby="files-title"
          className="rounded-xl border border-border bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="files-title" className="text-lg font-semibold">
              Master and Stems
            </h2>
            <span className="text-sm font-medium">
              Revision {submission.revisionNumber}
            </span>
          </div>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {submission.files.map((file) => (
              <li
                key={file.audioFileId}
                className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]"
              >
                <div>
                  <p className="font-medium break-all">
                    {file.originalFilename}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {file.role === "master"
                      ? "Master"
                      : `${file.stemType?.replaceAll("_", " ")}${file.stemLabel ? ` — ${file.stemLabel}` : ""}`}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {file.containerFormat?.toUpperCase() ??
                    "Pending verification"}
                  <br />
                  {formatBytes(file.byteSize)}
                </p>
                <p className="text-sm font-medium">
                  {file.uploadStatus === "completed"
                    ? "Files received"
                    : file.uploadStatus.replaceAll("_", " ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby="metadata-title"
          className="rounded-xl border border-border bg-surface p-5"
        >
          <h2 id="metadata-title" className="text-lg font-semibold">
            Producer metadata
          </h2>
          {Object.keys(submission.producerMetadata).length === 0 ? (
            <p className="mt-3 text-muted-foreground">
              No optional metadata supplied.
            </p>
          ) : (
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {Object.entries(submission.producerMetadata).map(
                ([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {key.replaceAll(/([A-Z_])/g, " $1")}
                    </dt>
                    <dd className="mt-1 text-sm break-words">
                      {Array.isArray(value)
                        ? value.join(", ")
                        : String(value || "Not supplied")}
                    </dd>
                  </div>
                ),
              )}
            </dl>
          )}
        </section>
        <SubmissionActions submission={submission} canMutate={canMutate} />
      </div>
      <aside className="space-y-6">
        <section
          aria-labelledby="rights-title"
          className="rounded-xl border border-border bg-surface p-5"
        >
          <h2 id="rights-title" className="font-semibold">
            Rights declaration
          </h2>
          {rights ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Master recording</dt>
                <dd className="mt-1 font-medium">
                  {rights.masterRightsBasis.replaceAll("_", " ")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Composition</dt>
                <dd className="mt-1 font-medium">
                  {rights.compositionRightsBasis.replaceAll("_", " ")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Content ID declaration
                </dt>
                <dd className="mt-1 font-medium">
                  {rights.contentIdEligibility.replaceAll("_", " ")}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No declaration available.
            </p>
          )}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Declarations do not prove ownership or copyright clearance.
          </p>
        </section>
        <section
          aria-labelledby="history-title"
          className="rounded-xl border border-border bg-surface p-5"
        >
          <h2 id="history-title" className="font-semibold">
            Submission history
          </h2>
          <ol className="mt-4 space-y-4">
            {events.map((event) => (
              <li key={event.id} className="border-l-2 border-border pl-3">
                <p className="text-sm font-medium">
                  {event.type.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.createdAt))}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
