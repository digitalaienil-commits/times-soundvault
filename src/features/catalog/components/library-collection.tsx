import { LibraryBig } from "lucide-react";

import type { TrackDto } from "@/types/domain/catalog";

export function LibraryCollection({ tracks }: { tracks: TrackDto[] }) {
  if (tracks.length === 0) {
    return (
      <section
        aria-labelledby="library-empty-title"
        className="mt-8 rounded-xl border border-border bg-surface px-6 py-14 text-center sm:px-10 sm:py-20"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
          <LibraryBig
            aria-hidden="true"
            className="size-5"
            strokeWidth={1.75}
          />
        </div>
        <h2
          id="library-empty-title"
          className="mt-6 text-xl font-semibold tracking-[-0.02em] text-foreground"
        >
          No published tracks yet
        </h2>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-muted-foreground">
          Approved music will appear here once the intake and review workflow is
          active.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="library-results-title" className="mt-8">
      <h2 id="library-results-title" className="sr-only">
        Published tracks
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {tracks.map((track) => (
          <li key={track.id} className="px-5 py-5 sm:px-7">
            <p className="font-semibold text-foreground">
              {track.title ?? "Untitled track"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {track.versionLabel ?? track.versionType.replaceAll("_", " ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
