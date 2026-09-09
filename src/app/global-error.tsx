"use client";

import "./globals.css";

/**
 * Replaces the root layout when it fails, so it must render its own document.
 * Only the production-safe digest reaches the browser.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="grid min-h-dvh place-items-center px-6 py-12">
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-8 shadow-soft sm:p-10">
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-foreground">
              Times SoundVault is unavailable.
            </h1>
            <p className="mt-4 leading-7 text-muted-foreground">
              The application could not start this page. Nothing was changed.
              Try again, and share the reference below if the problem continues.
            </p>
            {error.digest ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Reference{" "}
                <span className="font-mono tabular-nums">{error.digest}</span>
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => reset()}
              className="mt-8 inline-flex h-11 items-center rounded-lg bg-brand px-4 font-medium text-brand-foreground"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
