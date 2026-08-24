import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { readDashboardMetrics } from "./dashboard-metrics";

describe("readDashboardMetrics", () => {
  it("maps PostgreSQL aggregates and scopes producer metrics by owner", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          total_tracks: "247",
          average_ai_confidence: "0.84",
          attention_count: "12",
          total_duration_ms: "138600000",
          published_tracks: "204",
        },
      ],
    });

    await expect(
      readDashboardMetrics({ query } as unknown as Pick<Pool, "query">, "u-1"),
    ).resolves.toEqual({
      totalTracks: 247,
      averageAiConfidence: 0.84,
      attentionCount: 12,
      totalDurationMs: 138600000,
      publishedTracks: 204,
    });
    expect(query).toHaveBeenCalledWith(expect.any(String), ["u-1"]);
  });

  it("keeps missing AI confidence explicit", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          total_tracks: "0",
          average_ai_confidence: null,
          attention_count: "0",
          total_duration_ms: "0",
          published_tracks: "0",
        },
      ],
    });

    await expect(
      readDashboardMetrics({ query } as unknown as Pick<Pool, "query">, null),
    ).resolves.toMatchObject({ averageAiConfidence: null });
  });
});
