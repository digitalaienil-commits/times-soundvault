import Link from "next/link";
import { AudioLines, LibraryBig } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  catalogLibraryHref,
  catalogSearchInputToParams,
} from "@/lib/catalog-search/filters";
import type { CatalogSearchResult } from "@/types/catalog-search";

function formatDuration(ms: number | null) {
  if (ms === null) return "Duration unavailable";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CatalogResults({ result }: { result: CatalogSearchResult }) {
  const { input, items, total, pageCount, queryMessage } = result;
  const filterEntries = [...catalogSearchInputToParams(input).entries()].filter(
    ([name]) => !["q", "sort", "page", "pageSize"].includes(name),
  );
  const activeFilters = filterEntries.length ? (
    <div
      className="mb-4 flex flex-wrap items-center gap-2"
      aria-label="Active filters"
    >
      {filterEntries.map(([name, option], index) => {
        const params = catalogSearchInputToParams(input);
        const values = params.getAll(name);
        params.delete(name);
        let removed = false;
        values.forEach((value) => {
          if (!removed && value === option) removed = true;
          else params.append(name, value);
        });
        params.delete("page");
        const label = option.replaceAll("_", " ").replaceAll("-", " ");
        return (
          <Badge key={`${name}-${option}-${index}`} asChild variant="outline">
            <Link
              href={params.toString() ? `/library?${params}` : "/library"}
              aria-label={`Remove ${label} filter`}
            >
              {label} ×
            </Link>
          </Badge>
        );
      })}
      <Link
        href={
          input.query
            ? `/library?q=${encodeURIComponent(input.query)}`
            : "/library"
        }
        className="text-xs font-semibold text-brand underline-offset-4 hover:underline"
      >
        Clear filters
      </Link>
    </div>
  ) : null;
  if (queryMessage || items.length === 0) {
    return (
      <>
        {activeFilters}
        <section
          aria-labelledby="library-empty-title"
          className="rounded-xl border border-border bg-surface px-6 py-14 text-center"
        >
          <LibraryBig
            aria-hidden="true"
            className="mx-auto size-8 text-muted-foreground"
          />
          <h2
            id="library-empty-title"
            className="mt-4 text-xl font-semibold text-foreground"
          >
            {queryMessage ??
              (input.query
                ? "No published tracks match"
                : "No published tracks yet")}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            {queryMessage
              ? "A search made only of exclusions is too broad."
              : input.query
                ? "Try fewer filters, a shorter phrase, or a title spelling close to the original."
                : "Tracks appear here only after their canonical revision is published."}
          </p>
        </section>
      </>
    );
  }
  return (
    <section aria-labelledby="library-results-title">
      {activeFilters}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2
          id="library-results-title"
          className="font-semibold text-foreground"
        >
          {total.toLocaleString()} published {total === 1 ? "track" : "tracks"}
        </h2>
        <p className="text-xs text-muted-foreground">
          Page {input.page} of {pageCount}
        </p>
      </div>
      <ul className="space-y-3">
        {items.map((track) => (
          <li key={track.trackId}>
            <Link
              href={`/library/${track.trackId}`}
              className="group block rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-muted focus-visible:outline-offset-2"
            >
              <div className="flex gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <AudioLines aria-hidden="true" className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-brand">
                        {track.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {track.versionLabel ??
                          track.versionType.replaceAll("_", " ")}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {track.assetKind.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  {track.descriptionCaption ? (
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {track.descriptionCaption}
                    </p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
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
                    {track.stemCount ? (
                      <span>{track.stemCount} stems</span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {track.terms.slice(0, 6).map((term) => (
                      <Badge
                        key={`${term.category}-${term.slug}`}
                        variant="secondary"
                      >
                        {term.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {pageCount > 1 ? (
        <nav
          aria-label="Library result pages"
          className="mt-6 flex items-center justify-between"
        >
          <Button asChild variant="outline" size="lg">
            <Link
              aria-disabled={input.page <= 1}
              tabIndex={input.page <= 1 ? -1 : undefined}
              href={
                input.page <= 1
                  ? "#"
                  : catalogLibraryHref(input, (params) =>
                      params.set("page", String(input.page - 1)),
                    )
              }
            >
              Previous
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link
              aria-disabled={input.page >= pageCount}
              tabIndex={input.page >= pageCount ? -1 : undefined}
              href={
                input.page >= pageCount
                  ? "#"
                  : catalogLibraryHref(input, (params) =>
                      params.set("page", String(input.page + 1)),
                    )
              }
            >
              Next
            </Link>
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
