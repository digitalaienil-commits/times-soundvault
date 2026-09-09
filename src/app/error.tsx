"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { productConfig } from "@/config/product";

/**
 * Next.js keeps the message and stack on the server and passes only a
 * production-safe `digest` to the browser. Showing the digest lets an operator
 * correlate the report with the server log without the page exposing any
 * internal detail.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-8 shadow-soft sm:p-10">
        <p className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">
          {productConfig.name}
        </p>
        <p className="mt-10 font-mono text-sm font-semibold text-brand tabular-nums">
          Error
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Something went wrong.
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          The workspace could not complete that request, and nothing was
          changed. Try again, and share the reference below if the problem
          continues.
        </p>
        {error.digest ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Reference{" "}
            <span className="font-mono tabular-nums">{error.digest}</span>
          </p>
        ) : null}
        <Button className="mt-8 h-11 px-4" onClick={() => reset()}>
          <RotateCcw aria-hidden="true" data-icon="inline-start" />
          Try again
        </Button>
      </div>
    </main>
  );
}
