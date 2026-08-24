import { HardDrive, Layers3, Music2 } from "lucide-react";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

interface BatchSummaryProps {
  tracks: number;
  files: number;
  stems: number;
  bytes: number;
  storageLabel: string;
}

export function BatchSummary({
  tracks,
  files,
  stems,
  bytes,
  storageLabel,
}: BatchSummaryProps) {
  return (
    <aside
      aria-label="Batch summary"
      className="rounded-xl border border-border bg-surface p-5 shadow-soft lg:sticky lg:top-24"
    >
      <p className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">
        Batch summary
      </p>
      <dl className="mt-5 space-y-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-muted-foreground">
            <Music2 aria-hidden="true" className="size-4" />
            Tracks
          </dt>
          <dd className="font-semibold tabular-nums">{tracks}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-muted-foreground">
            <Layers3 aria-hidden="true" className="size-4" />
            Files / stems
          </dt>
          <dd className="font-semibold tabular-nums">
            {files} / {stems}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-muted-foreground">
            <HardDrive aria-hidden="true" className="size-4" />
            Total size
          </dt>
          <dd className="font-semibold tabular-nums">{formatBytes(bytes)}</dd>
        </div>
      </dl>
      <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        Storage: {storageLabel}
      </p>
    </aside>
  );
}
