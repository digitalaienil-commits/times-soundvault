import Link from "next/link";
import { AudioLines } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PublishedTrackMediaActions } from "@/components/shared/published-track-media-actions";
import type { CatalogSearchResult } from "@/types/catalog-search";

import {
  addDemandReferenceAction,
  proposeCatalogTrackAction,
} from "../actions/demand-actions";
import { DemandActionForm } from "./demand-action-form";

export function DemandCatalogResults({
  demandId,
  result,
  canRespond,
  canManage,
  rowVersion,
}: {
  demandId: string;
  result: CatalogSearchResult;
  canRespond: boolean;
  canManage: boolean;
  rowVersion: number;
}) {
  const queue = result.items
    .filter((item) => item.masterPlaybackReady)
    .map((item) => ({
      trackId: item.trackId,
      title: item.title,
      versionLabel: item.versionLabel,
      durationMs: item.durationMs,
    }));
  if (!result.items.length)
    return (
      <section className="rounded-xl border border-border bg-surface p-10 text-center">
        <h2 className="text-lg font-semibold">No published Tracks match</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Relax one of the applied hard filters to explore alternatives. Search
          changes do not alter the Demand.
        </p>
      </section>
    );
  return (
    <section aria-labelledby="demand-catalog-results">
      <h2 id="demand-catalog-results" className="mb-3 font-semibold">
        {result.total} published {result.total === 1 ? "Track" : "Tracks"}
      </h2>
      <ul className="space-y-3">
        {result.items.map((track) => (
          <li key={track.trackId}>
            <article className="rounded-xl border border-border bg-surface p-5">
              <div className="flex gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <AudioLines aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">
                        <Link
                          href={`/library/${track.trackId}`}
                          className="hover:text-brand hover:underline"
                        >
                          {track.title}
                        </Link>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {track.versionLabel ??
                          track.versionType.replaceAll("_", " ")}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {track.assetKind.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {track.terms.slice(0, 6).map((term) => (
                      <Badge
                        key={`${term.category}-${term.slug}`}
                        variant="secondary"
                      >
                        {term.label}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-start gap-3">
                    <PublishedTrackMediaActions
                      trackId={track.trackId}
                      title={track.title}
                      queue={queue}
                      playbackStatus={track.playbackStatus}
                      masterPlaybackReady={track.masterPlaybackReady}
                    />
                    {canRespond ? (
                      <DemandActionForm
                        action={proposeCatalogTrackAction}
                        label="Propose Track"
                        variant="default"
                      >
                        <input type="hidden" name="demandId" value={demandId} />
                        <input
                          type="hidden"
                          name="trackId"
                          value={track.trackId}
                        />
                        <label className="mb-2 grid gap-1 text-sm font-medium">
                          Pitch note{" "}
                          <input
                            name="pitchNote"
                            maxLength={1000}
                            className="min-h-11 rounded-lg border border-border px-3"
                            placeholder="Why this Track fits"
                          />
                        </label>
                      </DemandActionForm>
                    ) : null}
                    {canManage ? (
                      <DemandActionForm
                        action={addDemandReferenceAction}
                        label="Add as Reference"
                        variant="outline"
                      >
                        <input type="hidden" name="demandId" value={demandId} />
                        <input
                          type="hidden"
                          name="trackId"
                          value={track.trackId}
                        />
                        <input
                          type="hidden"
                          name="rowVersion"
                          value={rowVersion}
                        />
                      </DemandActionForm>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
