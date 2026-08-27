import "server-only";

import type { QueryResultRow } from "pg";

import { getDatabase } from "@/lib/database/database";
import { parseCyaniteConfig } from "@/lib/analysis/cyanite/config";
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

  return items;
}
