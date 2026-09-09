import "server-only";

import type { Pool } from "pg";

import { getDatabase } from "@/lib/database/database";

export interface RateLimitRule {
  /** Stable name for the protected operation. */
  bucket: string;
  /** Requests allowed per window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Sensitive endpoint budgets. Generation is the tightest because every live
 * request bills an external provider.
 */
export const RATE_LIMITS = {
  generation: { bucket: "generation", max: 12, windowSeconds: 300 },
  generationCommit: {
    bucket: "generation.commit",
    max: 30,
    windowSeconds: 300,
  },
  uploadSession: { bucket: "upload.session", max: 40, windowSeconds: 300 },
  deliveryPackage: {
    bucket: "delivery.package",
    max: 20,
    windowSeconds: 300,
  },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Atomically consumes one request from a fixed window.
 *
 * The window is stored per (bucket, subject). A single upsert either starts a
 * fresh window or increments the current one, so concurrent requests cannot
 * both observe an empty bucket. The subject is always a server-derived
 * identity, never a client-supplied value.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  subject: string,
  database: Pool = getDatabase(),
): Promise<RateLimitResult> {
  const result = await database.query<{
    request_count: number;
    window_started_at: Date;
  }>(
    `INSERT INTO system.rate_limit_counter
       (bucket, subject, window_started_at, request_count, updated_at)
     VALUES ($1, $2, now(), 1, now())
     ON CONFLICT (bucket, subject) DO UPDATE
       SET request_count =
             CASE
               WHEN system.rate_limit_counter.window_started_at
                    <= now() - make_interval(secs => $3::double precision)
               THEN 1
               ELSE system.rate_limit_counter.request_count + 1
             END,
           window_started_at =
             CASE
               WHEN system.rate_limit_counter.window_started_at
                    <= now() - make_interval(secs => $3::double precision)
               THEN now()
               ELSE system.rate_limit_counter.window_started_at
             END,
           updated_at = now()
     RETURNING request_count, window_started_at`,
    [rule.bucket, subject, rule.windowSeconds],
  );

  const row = result.rows[0];
  const used = row?.request_count ?? 1;
  const elapsedSeconds = row
    ? Math.floor((Date.now() - row.window_started_at.getTime()) / 1000)
    : 0;

  return {
    allowed: used <= rule.max,
    remaining: Math.max(0, rule.max - used),
    retryAfterSeconds: Math.max(
      1,
      rule.windowSeconds - Math.max(0, elapsedSeconds),
    ),
  };
}

/** Removes windows that can no longer deny a request. */
export async function pruneRateLimitCounters(
  database: Pool = getDatabase(),
): Promise<number> {
  const result = await database.query(
    `DELETE FROM system.rate_limit_counter
      WHERE window_started_at < now() - interval '1 day'`,
  );
  return result.rowCount ?? 0;
}
