import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  consumeRateLimit,
  pruneRateLimitCounters,
  type RateLimitRule,
} from "./rate-limit";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

databaseDescribe("rate limit counters", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  const rule = (max: number, windowSeconds = 300): RateLimitRule => ({
    bucket: `test-${randomUUID()}`,
    max,
    windowSeconds,
  });

  it("allows requests up to the limit and denies the next one", async () => {
    const limit = rule(3);
    const subject = randomUUID();

    const results = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      results.push(await consumeRateLimit(limit, subject, pool));
    }

    expect(results.map((result) => result.allowed)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(results[2].remaining).toBe(0);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps subjects independent", async () => {
    const limit = rule(1);

    expect((await consumeRateLimit(limit, randomUUID(), pool)).allowed).toBe(
      true,
    );
    expect((await consumeRateLimit(limit, randomUUID(), pool)).allowed).toBe(
      true,
    );
  });

  it("starts a fresh window once the previous one has elapsed", async () => {
    const limit = rule(1, 1);
    const subject = randomUUID();

    expect((await consumeRateLimit(limit, subject, pool)).allowed).toBe(true);
    expect((await consumeRateLimit(limit, subject, pool)).allowed).toBe(false);

    await pool.query(
      `UPDATE system.rate_limit_counter
          SET window_started_at = now() - interval '10 seconds'
        WHERE bucket = $1 AND subject = $2`,
      [limit.bucket, subject],
    );

    expect((await consumeRateLimit(limit, subject, pool)).allowed).toBe(true);
  });

  it("counts concurrent requests exactly once each", async () => {
    const limit = rule(2);
    const subject = randomUUID();

    const outcomes = await Promise.all(
      Array.from({ length: 6 }, () => consumeRateLimit(limit, subject, pool)),
    );

    expect(outcomes.filter((outcome) => outcome.allowed)).toHaveLength(2);
  });

  it("prunes only windows that can no longer deny a request", async () => {
    const limit = rule(1);
    const subject = randomUUID();
    await consumeRateLimit(limit, subject, pool);
    await pool.query(
      `UPDATE system.rate_limit_counter
          SET window_started_at = now() - interval '2 days'
        WHERE bucket = $1 AND subject = $2`,
      [limit.bucket, subject],
    );

    await pruneRateLimitCounters(pool);

    const remaining = await pool.query(
      `SELECT 1 FROM system.rate_limit_counter WHERE bucket = $1`,
      [limit.bucket],
    );
    expect(remaining.rowCount).toBe(0);
  });
});
