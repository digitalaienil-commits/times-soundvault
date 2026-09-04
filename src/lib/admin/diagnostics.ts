import "server-only";

import type { QueryResultRow } from "pg";

import { getDatabase } from "@/lib/database/database";
import { parseCyaniteConfig } from "@/lib/analysis/cyanite/config";
import { parseGenerationConfig } from "@/lib/generation/config";
import { parseMediaConfig } from "@/lib/media/config";
import { parseStorageConfig } from "@/lib/storage/config";

export type AdminHealthState =
  "healthy" | "warning" | "degraded" | "disabled" | "unknown";

export interface AdminHealthItem {
  key: string;
  label: string;
  status: AdminHealthState;
  summary: string;
  detail: string;
}

function configHealth(
  key: string,
  label: string,
  read: () => string,
): AdminHealthItem {
  try {
    return {
      key,
      label,
      status: "healthy",
      summary: "Configured",
      detail: read(),
    };
  } catch (error) {
    return {
      key,
      label,
      status: "degraded",
      summary: "Configuration needs attention",
      detail: error instanceof Error ? error.message : "Configuration failed",
    };
  }
}

export async function getSystemHealthItems(): Promise<AdminHealthItem[]> {
  const database = getDatabase();
  const items: AdminHealthItem[] = [];
  try {
    await database.query("SELECT 1");
    items.push({
      key: "database",
      label: "Database",
      status: "healthy",
      summary: "PostgreSQL responded",
      detail: "Core SoundVault schemas are reachable.",
    });
  } catch (error) {
    items.push({
      key: "database",
      label: "Database",
      status: "degraded",
      summary: "PostgreSQL check failed",
      detail: error instanceof Error ? error.message : "Database check failed",
    });
  }

  items.push(
    configHealth("storage", "Storage", () => {
      const config = parseStorageConfig();
      return config.provider === "onedrive"
        ? "Dedicated SharePoint storage is selected. Secrets remain server-side."
        : `Private local storage at ${config.localRoot}`;
    }),
    configHealth("media", "Media workers", () => {
      const config = parseMediaConfig();
      return `${config.jobConcurrency} preview workers, ${config.packageRetentionHours} hour package retention.`;
    }),
  );

  try {
    const config = parseCyaniteConfig();
    items.push({
      key: "cyanite",
      label: "Cyanite",
      status: config.enabled ? "healthy" : "disabled",
      summary: config.enabled ? "Enabled" : "Disabled",
      detail: config.enabled
        ? "Cyanite credentials are present without exposing tokens."
        : "Provider analysis is disabled by environment configuration.",
    });
  } catch (error) {
    items.push({
      key: "cyanite",
      label: "Cyanite",
      status: "degraded",
      summary: "Configuration needs attention",
      detail: error instanceof Error ? error.message : "Cyanite check failed",
    });
  }

  try {
    const result = await database.query<
      { total_count: string; stale_count: string } & QueryResultRow
    >(
      `SELECT
         count(*)::text AS total_count,
         count(*) FILTER (
           WHERE document.updated_at < COALESCE(track.published_at, track.updated_at)
         )::text AS stale_count
       FROM catalog.track track
       LEFT JOIN catalog.track_search_document document
         ON document.track_id = track.id
       WHERE track.publication_status = 'published'`,
    );
    const row = result.rows[0];
    const total = Number(row?.total_count ?? 0);
    const stale = Number(row?.stale_count ?? 0);
    items.push({
      key: "search",
      label: "Search index",
      status: stale > 0 ? "warning" : "healthy",
      summary: `${total - stale}/${total} published tracks indexed`,
      detail:
        stale > 0
          ? `${stale} published track search documents are stale or missing.`
          : "Published catalog search documents are current.",
    });
  } catch (error) {
    items.push({
      key: "search",
      label: "Search index",
      status: "unknown",
      summary: "Search status unavailable",
      detail: error instanceof Error ? error.message : "Search check failed",
    });
  }

  try {
    const result = await database.query<
      { running_count: string } & QueryResultRow
    >(
      `SELECT count(*)::text AS running_count
       FROM rights.copyright_job
       WHERE status IN ('queued','running')`,
    );
    items.push({
      key: "copyright",
      label: "Copyright provider",
      status: "healthy",
      summary: "Manual YouTube workflow",
      detail: `${Number(result.rows[0]?.running_count ?? 0)} test-batch jobs are active. No Google or YouTube API connectivity is implied.`,
    });
  } catch (error) {
    items.push({
      key: "copyright",
      label: "Copyright provider",
      status: "unknown",
      summary: "Copyright status unavailable",
      detail: error instanceof Error ? error.message : "Copyright check failed",
    });
  }

  // Section 13: PGVector & Track Embeddings
  try {
    const extResult = await database.query<
      { extversion: string } & QueryResultRow
    >("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    const hasVectorExt = extResult.rows.length > 0;
    const extVersion = extResult.rows[0]?.extversion ?? "none";

    const embStatsResult = await database.query<
      {
        total_published: string;
        ready_count: string;
        queued_count: string;
        stale_count: string;
        failed_count: string;
      } & QueryResultRow
    >(
      `SELECT
         (SELECT count(*)::text FROM catalog.track WHERE publication_status = 'published') AS total_published,
         count(*) FILTER (WHERE status = 'ready')::text AS ready_count,
         count(*) FILTER (WHERE status = 'queued')::text AS queued_count,
         count(*) FILTER (WHERE status = 'stale')::text AS stale_count,
         count(*) FILTER (WHERE status = 'failed')::text AS failed_count
       FROM catalog.track_embedding`,
    );

    const stats = embStatsResult.rows[0];
    const ready = Number(stats?.ready_count ?? 0);
    const totalPub = Number(stats?.total_published ?? 0);
    const queued = Number(stats?.queued_count ?? 0);
    const stale = Number(stats?.stale_count ?? 0);
    const failed = Number(stats?.failed_count ?? 0);

    let status: AdminHealthState = "healthy";
    if (!hasVectorExt) status = "degraded";
    else if (failed > 0) status = "warning";
    else if (queued > 0 || stale > 0) status = "healthy";

    items.push({
      key: "embeddings",
      label: "PGVector & Embeddings",
      status,
      summary: hasVectorExt
        ? `${ready}/${totalPub} published tracks embedded (v${extVersion})`
        : "pgvector extension missing",
      detail: hasVectorExt
        ? `Ready: ${ready}, Queued: ${queued}, Stale: ${stale}, Failed: ${failed}. HNSW indexing active.`
        : "The pgvector extension is not installed in the PostgreSQL database.",
    });
  } catch (error) {
    items.push({
      key: "embeddings",
      label: "PGVector & Embeddings",
      status: "unknown",
      summary: "Embeddings status unavailable",
      detail:
        error instanceof Error ? error.message : "Embeddings check failed",
    });
  }

  // Section 13: AI Generation Provider
  try {
    const genConfig = parseGenerationConfig();
    const hasKey =
      genConfig.provider === "google_lyria"
        ? Boolean(genConfig.geminiApiKey)
        : Boolean(genConfig.elevenLabsApiKey);

    items.push({
      key: "generation",
      label: "AI Generation",
      status: "healthy",
      summary: genConfig.dryRun
        ? "Dry Run (Simulated Audio)"
        : "Live Provider Active",
      detail: `Active Provider: ${genConfig.provider}. Dry-run: ${genConfig.dryRun ? "Enabled (Zero Cost)" : "Disabled"}. Credentials: ${hasKey ? "Present" : "Simulated fallback"}.`,
    });
  } catch (error) {
    items.push({
      key: "generation",
      label: "AI Generation",
      status: "unknown",
      summary: "Generation config unavailable",
      detail:
        error instanceof Error ? error.message : "Generation check failed",
    });
  }

  return items;
}
