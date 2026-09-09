import "server-only";

import { NextResponse } from "next/server";

/**
 * Unexpected failures must never return provider messages, SQL text, storage
 * keys or file paths to the browser. The detail is logged server-side with a
 * short reference the operator can grep for; the client receives that
 * reference and nothing else.
 */
export function unexpectedErrorResponse(
  scope: string,
  error: unknown,
): NextResponse {
  const reference = crypto.randomUUID();
  console.error(
    `[${scope}] unexpected failure reference=${reference}`,
    error instanceof Error ? error.stack : error,
  );
  return NextResponse.json(
    {
      error: "Something went wrong. Please try again.",
      reference,
    },
    { status: 500 },
  );
}
