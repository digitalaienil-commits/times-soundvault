export interface ManifestSource {
  submissionId: string;
  submissionRevisionId: string;
  trackId: string;
  title: string;
  sha256: string;
  durationMs: number;
}

export interface CopyrightManifestItem extends ManifestSource {
  sequence: number;
  startMs: number;
  endMs: number;
}

export function buildCopyrightManifest(
  batchId: string,
  sources: readonly ManifestSource[],
  gapMs: number,
) {
  let cursor = 0;
  const items: CopyrightManifestItem[] = sources.map((source, index) => {
    const startMs = cursor;
    const endMs = startMs + source.durationMs;
    cursor = endMs + (index < sources.length - 1 ? gapMs : 0);
    return {
      submissionId: source.submissionId,
      submissionRevisionId: source.submissionRevisionId,
      trackId: source.trackId,
      title: source.title,
      sha256: source.sha256,
      durationMs: source.durationMs,
      sequence: index + 1,
      startMs,
      endMs,
    };
  });
  return {
    schemaVersion: 1,
    batchId,
    purpose: "manual_youtube_copyright_check",
    warning:
      "Test batches are operational copyright-check files only. They must never be registered as Content ID references.",
    gapMs,
    totalDurationMs: cursor,
    items,
  } as const;
}
