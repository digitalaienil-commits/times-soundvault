import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AudioLines } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { requireRouteFamilyAccess } from "@/lib/auth/current-user";
import { getPublishedTrackDetail } from "@/lib/catalog-search/service";

export const metadata: Metadata = { title: "Published Track" };

function value(item: string | number | null | undefined) {
  return item === null || item === undefined || item === ""
    ? "Not supplied"
    : String(item);
}

export default async function PublishedTrackPage({
  params,
}: {
  params: Promise<{ trackId: string }>;
}) {
  const { trackId } = await params;
  await requireRouteFamilyAccess("/library/[trackId]", `/library/${trackId}`);
  const track = await getPublishedTrackDetail(trackId);
  if (!track) notFound();
  const metadataItems = [
    ["BPM", track.bpm],
    ["Key", [track.keyTonic, track.keyMode].filter(Boolean).join(" ")],
    ["Time signature", track.timeSignature],
    ["Vocal state", track.vocalState],
    ["Language", track.languageCode],
    ["Era", track.era],
    [
      "Under dialogue",
      track.underDialogue === null ? null : track.underDialogue ? "Yes" : "No",
    ],
    [
      "Loopable",
      track.loopable === null ? null : track.loopable ? "Yes" : "No",
    ],
    ["Ending", track.endingType?.replaceAll("_", " ")],
    [
      "Published",
      new Date(track.publishedAt).toLocaleDateString("en-IN", {
        dateStyle: "medium",
      }),
    ],
  ] as const;
  const technicalItems = [
    [
      "Duration",
      track.masterTechnical.durationMs
        ? `${Math.round(track.masterTechnical.durationMs / 1000)} seconds`
        : null,
    ],
    ["Format", track.masterTechnical.containerFormat],
    ["Codec", track.masterTechnical.codec],
    [
      "Sample rate",
      track.masterTechnical.sampleRateHz
        ? `${track.masterTechnical.sampleRateHz} Hz`
        : null,
    ],
    [
      "Bit depth",
      track.masterTechnical.bitDepth
        ? `${track.masterTechnical.bitDepth}-bit`
        : null,
    ],
    [
      "Channels",
      track.masterTechnical.channelLayout ?? track.masterTechnical.channels,
    ],
  ] as const;
  return (
    <main>
      <Link
        href="/library"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" />
        Back to library
      </Link>
      <header className="mt-4 rounded-xl border border-border bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <AudioLines aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Published</Badge>
              <Badge variant="secondary">
                {track.assetKind.replaceAll("_", " ")}
              </Badge>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-foreground">
              {track.title}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {track.versionLabel ?? track.versionType.replaceAll("_", " ")}
            </p>
            {track.descriptionCaption ? (
              <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
                {track.descriptionCaption}
              </p>
            ) : null}
          </div>
        </div>
      </header>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section
          aria-labelledby="track-metadata"
          className="rounded-xl border border-border bg-surface p-6 xl:col-span-2"
        >
          <h2
            id="track-metadata"
            className="text-lg font-semibold text-foreground"
          >
            Canonical metadata
          </h2>
          <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {metadataItems.map(([label, item]) => (
              <div key={label}>
                <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {label}
                </dt>
                <dd className="mt-1 text-sm text-foreground">{value(item)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            {track.terms.map((term) => (
              <Badge key={`${term.category}-${term.slug}`} variant="secondary">
                {term.label}
              </Badge>
            ))}
          </div>
        </section>
        <aside className="space-y-6">
          <section
            aria-labelledby="technical-summary"
            className="rounded-xl border border-border bg-surface p-6"
          >
            <h2
              id="technical-summary"
              className="text-lg font-semibold text-foreground"
            >
              Technical summary
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              {technicalItems.map(([label, item]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right text-foreground">{value(item)}</dd>
                </div>
              ))}
            </dl>
          </section>
          {track.stems.length ? (
            <section
              aria-labelledby="stem-summary"
              className="rounded-xl border border-border bg-surface p-6"
            >
              <h2
                id="stem-summary"
                className="text-lg font-semibold text-foreground"
              >
                Available stems
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-foreground">
                {track.stems.map((stem, index) => (
                  <li key={`${stem.stemType}-${index}`}>
                    {stem.label ?? stem.stemType.replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Playback and downloads arrive in Section 10.
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
