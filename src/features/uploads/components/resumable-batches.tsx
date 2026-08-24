import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utilities/cn";

interface ResumableBatch {
  id: string;
  label: string | null;
  updatedAt: string;
  pendingFiles: number;
}

export function ResumableBatches({ batches }: { batches: ResumableBatch[] }) {
  if (batches.length === 0) return null;
  return (
    <section
      aria-labelledby="resumable-title"
      className="mt-8 rounded-xl border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <RotateCcw aria-hidden="true" className="size-5 text-brand" />
        <div>
          <h2 id="resumable-title" className="font-semibold">
            Resume a saved upload
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft batches remain private to their owner. Admin can open any
            Submission from My Uploads.
          </p>
        </div>
      </div>
      <ul className="mt-5 divide-y divide-border border-y border-border">
        {batches.map((batch) => (
          <li
            key={batch.id}
            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">
                {batch.label ?? "Untitled upload batch"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {batch.pendingFiles} unfinished files · Updated{" "}
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "medium",
                }).format(new Date(batch.updatedAt))}
              </p>
            </div>
            <Link
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-11 px-4",
              )}
              href={`/upload/${batch.id}`}
            >
              Resume
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
