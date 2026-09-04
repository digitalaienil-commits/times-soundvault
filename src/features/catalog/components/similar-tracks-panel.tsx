import Link from "next/link";
import { AudioLines, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { SimilarTrackItem } from "@/lib/catalog-search/similarity";
import { LibraryMediaActions } from "./library-media-actions";

function formatDuration(ms: number | null) {
  if (ms === null) return "Duration unavailable";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function SimilarTracksPanel({ tracks }: { tracks: SimilarTrackItem[] }) {
  if (!tracks.length) {
    return (
      <section
        aria-labelledby="similar-tracks-title"
        className="rounded-xl border border-border bg-surface p-6"
      >
        <div className="flex items-center gap-2">
          <Sparkles
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
          <h2
            id="similar-tracks-title"
            className="text-lg font-semibold text-foreground"
          >
            Similar published tracks
          </h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          No similar published tracks are available right now. Embeddings are
          generated automatically as new tracks are published.
        </p>
      </section>
    );
  }

  const playbackQueue = tracks
    .filter((item) => item.masterPlaybackReady)
    .map((item) => ({
      trackId: item.trackId,
      title: item.title,
      versionLabel: item.versionLabel,
      durationMs: item.durationMs,
    }));

  return (
    <section
      aria-labelledby="similar-tracks-title"
      className="rounded-xl border border-border bg-surface p-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand" aria-hidden="true" />
          <h2
            id="similar-tracks-title"
            className="text-lg font-semibold text-foreground"
          >
            Similar published tracks
          </h2>
        </div>
        <Badge variant="outline" className="text-xs">
          Vector similarity
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Recommended canonical tracks based on musical mood, instrumentation, and
        metadata.
      </p>

      <ul className="mt-5 space-y-3">
        {tracks.map((track) => {
          const matchPercent = Math.round(track.similarity * 100);
          return (
            <li key={track.trackId}>
              <article className="rounded-lg border border-border/80 bg-background/50 p-4 transition-colors hover:bg-muted/50">
                <div className="flex gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <AudioLines aria-hidden="true" className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">
                          <Link
                            href={`/library/${track.trackId}`}
                            className="text-foreground underline-offset-4 hover:text-brand hover:underline"
                          >
                            {track.title}
                          </Link>
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {track.versionLabel ??
                            track.versionType.replaceAll("_", " ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className="text-[11px] font-medium text-brand"
                        >
                          {matchPercent}% match
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatDuration(track.durationMs)}</span>
                      {track.bpm ? (
                        <span>{Math.round(track.bpm)} BPM</span>
                      ) : null}
                      {track.keyTonic ? (
                        <span>
                          {track.keyTonic} {track.keyMode}
                        </span>
                      ) : null}
                      <span>{track.vocalState}</span>
                    </div>

                    {track.terms.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {track.terms.slice(0, 4).map((term) => (
                          <Badge
                            key={`${term.category}-${term.slug}`}
                            variant="outline"
                            className="px-1.5 py-0 text-[10px]"
                          >
                            {term.label}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3">
                      <LibraryMediaActions
                        trackId={track.trackId}
                        title={track.title}
                        queue={playbackQueue}
                        playbackStatus={track.playbackStatus}
                        masterPlaybackReady={track.masterPlaybackReady}
                      />
                    </div>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
