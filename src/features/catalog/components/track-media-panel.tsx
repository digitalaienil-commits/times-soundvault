"use client";

import { useEffect, useState } from "react";
import { Download, LoaderCircle, PackageOpen, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSoundVaultPlayer } from "@/components/shell/player-provider";
import type {
  DownloadPackageDto,
  DownloadPackageScope,
  PlaybackDescriptor,
} from "@/types/media";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function packageLabel(scope: DownloadPackageScope) {
  return scope === "stems" ? "All Stems" : "Full Package";
}

export function TrackMediaPanel({ trackId }: { trackId: string }) {
  const player = useSoundVaultPlayer();
  const [descriptor, setDescriptor] = useState<PlaybackDescriptor | null>(null);
  const [message, setMessage] = useState("Loading media…");
  const [packageLoading, setPackageLoading] = useState<string | null>(null);
  const [packages, setPackages] = useState<
    Partial<Record<DownloadPackageScope, DownloadPackageDto>>
  >({});

  useEffect(() => {
    let active = true;
    void fetch(`/api/library/tracks/${trackId}/playback`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Media is unavailable.");
        return (await response.json()) as PlaybackDescriptor;
      })
      .then((data) => {
        if (active) {
          setDescriptor(data);
          setMessage("");
        }
      })
      .catch((error) => {
        if (active)
          setMessage(
            error instanceof Error ? error.message : "Media is unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [trackId]);

  async function requestPackage(scope: DownloadPackageScope) {
    setPackageLoading(scope);
    setMessage("Preparing your private package…");
    try {
      const response = await fetch(`/api/library/tracks/${trackId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const result = (await response.json()) as {
        packageId?: string;
        error?: string;
      };
      if (!response.ok || !result.packageId)
        throw new Error(result.error ?? "Package could not be prepared.");
      setPackages((current) => ({
        ...current,
        [scope]: {
          packageId: result.packageId!,
          scope,
          status: "queued",
          byteSize: null,
          expiresAt: null,
          safeFilename: "",
          downloadUrl: null,
        },
      }));
      for (let attempt = 0; attempt < 90; attempt += 1) {
        const statusResponse = await fetch(
          `/api/library/packages/${result.packageId}`,
          { cache: "no-store" },
        );
        if (!statusResponse.ok)
          throw new Error("Package status could not be refreshed.");
        const status = (await statusResponse.json()) as DownloadPackageDto;
        setPackages((current) => ({ ...current, [scope]: status }));
        if (status.status === "ready" && status.downloadUrl) {
          setMessage(
            `${packageLabel(scope)} is ready. Choose Download ZIP to save it.`,
          );
          return;
        }
        if (["failed", "expired", "cancelled"].includes(status.status ?? "")) {
          throw new Error("Package preparation did not complete.");
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      throw new Error("Package preparation is taking longer than expected.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Package is unavailable.",
      );
    } finally {
      setPackageLoading(null);
    }
  }

  return (
    <section
      aria-labelledby="published-media-title"
      className="rounded-xl border border-border bg-surface p-6"
    >
      <h2
        id="published-media-title"
        className="text-lg font-semibold text-foreground"
      >
        Listen and download
      </h2>
      {message ? (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      {descriptor ? (
        <ul className="mt-4 space-y-3">
          {descriptor.sources.map((source) => (
            <li
              key={source.audioAssetId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {source.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(source.sourceFormat ?? "Original").toUpperCase()} ·{" "}
                  {formatBytes(source.sourceByteSize)} ·{" "}
                  {source.ready ? "Preview ready" : "Preview preparing"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!source.ready}
                  aria-label={`Play ${source.label}`}
                  onClick={() =>
                    void player.playTrack(
                      trackId,
                      [
                        {
                          trackId,
                          title: descriptor.title,
                          versionLabel: descriptor.versionLabel,
                          durationMs:
                            descriptor.sources.find(
                              (item) => item.kind === "master",
                            )?.durationMs ?? null,
                        },
                      ],
                      source.audioAssetId,
                    )
                  }
                >
                  <Play aria-hidden="true" />
                  Play
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a
                    href={source.downloadUrl}
                    aria-label={`Download original ${source.label}`}
                  >
                    <Download aria-hidden="true" />
                    Original
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-5 grid gap-3">
        {(["stems", "full"] as const).map((scope) => {
          const state = packages[scope];
          const disabledForNoStems =
            scope === "stems" &&
            !descriptor?.sources.some((source) => source.kind === "stem");
          return (
            <div key={scope} className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-foreground">
                {packageLabel(scope)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {state?.status === "ready"
                  ? `${state.byteSize === null ? "ZIP" : formatBytes(state.byteSize)} · expires ${state.expiresAt ? new Date(state.expiresAt).toLocaleString("en-IN") : "after 24 hours"}`
                  : state?.status === "queued"
                    ? "Queued"
                    : state?.status === "building"
                      ? "Preparing"
                      : "Private ZIP prepared on request"}
              </p>
              {state?.status === "ready" && state.downloadUrl ? (
                <Button
                  asChild
                  className="mt-3 w-full whitespace-normal"
                  size="sm"
                  variant="outline"
                >
                  <a href={state.downloadUrl} download={state.safeFilename}>
                    <Download aria-hidden="true" />
                    Download ZIP
                  </a>
                </Button>
              ) : (
                <Button
                  className="mt-3 w-full whitespace-normal"
                  size="sm"
                  variant="outline"
                  disabled={
                    packageLoading !== null || !descriptor || disabledForNoStems
                  }
                  onClick={() => void requestPackage(scope)}
                >
                  {packageLoading === scope ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <PackageOpen aria-hidden="true" />
                  )}
                  Prepare {packageLabel(scope)}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
