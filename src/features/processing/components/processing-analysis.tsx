import type { ProcessingAnalysisDto } from "@/types/processing";

import { ProcessingRetryButton } from "./processing-retry-button";

const number = (value: number | null, digits = 1) =>
  value == null ? "Not detected" : value.toFixed(digits);
const duration = (milliseconds: number) =>
  `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}`;

export function ProcessingAnalysis({
  analysis,
  submissionId,
  canRetry,
}: {
  analysis: ProcessingAnalysisDto | null;
  submissionId: string;
  canRetry: boolean;
}) {
  if (!analysis) return null;
  const status = analysis.overallStatus.replaceAll("_", " ");
  return (
    <section
      aria-labelledby="processing-title"
      className="rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="processing-title" className="text-lg font-semibold">
            Technical processing
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {status.charAt(0).toUpperCase() + status.slice(1)} · AI analysis{" "}
            {analysis.aiStatus.replaceAll("_", " ")}
          </p>
        </div>
        {analysis.overallStatus === "failed" && canRetry ? (
          <ProcessingRetryButton submissionId={submissionId} />
        ) : null}
      </div>
      {analysis.lastErrorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          {analysis.lastErrorMessage}
        </p>
      ) : null}
      {analysis.technicalResults.length ? (
        <div className="mt-5 space-y-4">
          {analysis.technicalResults.map((file) => (
            <article
              key={file.audioFileId}
              className="rounded-lg border border-border p-4"
            >
              <h3 className="font-medium break-all">{file.displayTitle}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {file.assetRole === "master"
                  ? "Master"
                  : `Stem · ${file.stemType?.replaceAll("_", " ") ?? "other"}`}
              </p>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Format</dt>
                  <dd>
                    {file.containerFormat.toUpperCase()} · {file.codec}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd>{duration(file.durationMs)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Audio</dt>
                  <dd>
                    {file.sampleRateHz
                      ? `${(file.sampleRateHz / 1000).toFixed(1)} kHz`
                      : "Unknown"}{" "}
                    ·{" "}
                    {file.bitDepth
                      ? `${file.bitDepth}-bit`
                      : "bit depth unknown"}{" "}
                    · {file.channels ?? "?"} ch
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Loudness / peak</dt>
                  <dd>
                    {number(file.integratedLoudnessLufs)} LUFS ·{" "}
                    {number(file.truePeakDbtp)} dBTP
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Silence</dt>
                  <dd>
                    {number(file.leadingSilenceMs, 0)} ms lead ·{" "}
                    {number(file.trailingSilenceMs, 0)} ms tail
                  </dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-muted-foreground">SHA-256</dt>
                  <dd className="font-mono text-xs break-all">{file.sha256}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Technical results will appear after the background worker processes
          the private source files.
        </p>
      )}
      {analysis.issues.length ? (
        <div className="mt-5">
          <h3 className="font-semibold">Quality-control flags</h3>
          <ul className="mt-2 space-y-2">
            {analysis.issues.map((issue) => (
              <li
                key={issue.id}
                className="rounded-lg border border-border p-3 text-sm"
              >
                <span className="font-medium capitalize">{issue.severity}</span>{" "}
                · {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {analysis.normalizedAiResult ? (
        <div className="mt-5">
          <h3 className="font-semibold">AI suggestions</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Suggestions only; canonical metadata is unchanged.
          </p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Genres</dt>
              <dd>{analysis.normalizedAiResult.genres.join(", ") || "None"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Moods</dt>
              <dd>{analysis.normalizedAiResult.moods.join(", ") || "None"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Instruments</dt>
              <dd>
                {analysis.normalizedAiResult.instruments.join(", ") || "None"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tempo / key</dt>
              <dd>
                {analysis.normalizedAiResult.bpm ?? "Unknown"} BPM ·{" "}
                {analysis.normalizedAiResult.key ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Voice</dt>
              <dd>{analysis.normalizedAiResult.vocalState ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Caption</dt>
              <dd>
                {analysis.normalizedAiResult.transformerCaption ?? "None"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
