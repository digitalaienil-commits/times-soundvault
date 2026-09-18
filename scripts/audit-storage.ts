import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { getDatabase } from "../src/lib/database/database";
import { parseStorageConfig } from "../src/lib/storage/config";

import { acquireGraphApplication, graph } from "./graph-app-client";

/**
 * Reconciles what the catalogue believes it stored against what the provider
 * actually holds.
 *
 * The two can drift apart in both directions and neither shows up in the
 * application: an upload that failed part-way leaves a row pointing at an
 * object that was never finished, and an operator script that created
 * something without recording it leaves an object no row will ever reference.
 * Both are invisible until somebody opens the document library and wonders
 * what they are looking at.
 *
 * This reads only. It reports; removing anything is a separate, deliberate act.
 */
interface ProviderItem {
  id: string;
  path: string;
  size: number;
  title: string | null;
}

interface CatalogueRow {
  storage_key: string;
  byte_size: string;
  file_role: string;
  technical_status: string;
  title: string | null;
  submission_status: string;
}

async function listProviderItems(): Promise<ProviderItem[]> {
  const app = await acquireGraphApplication({
    tenantId: process.env.ONEDRIVE_TENANT_ID!,
    clientId: process.env.ONEDRIVE_CLIENT_ID!,
    clientSecret: process.env.ONEDRIVE_CLIENT_SECRET!,
  });
  const drive = encodeURIComponent(process.env.ONEDRIVE_DRIVE_ID!);
  const items: ProviderItem[] = [];
  const walk = async (itemId: string, prefix: string): Promise<void> => {
    const page = await graph<{
      value: Array<{
        id: string;
        name: string;
        size: number;
        folder?: unknown;
        listItem?: { fields?: { Title?: string } };
      }>;
    }>(
      app,
      `/drives/${drive}/items/${encodeURIComponent(itemId)}/children?$expand=listItem($expand=fields)`,
    );
    for (const child of page.value) {
      if (child.folder) {
        await walk(child.id, `${prefix}${child.name}/`);
        continue;
      }
      items.push({
        id: child.id,
        path: `${prefix}${child.name}`,
        size: child.size,
        title: child.listItem?.fields?.Title ?? null,
      });
    }
  };
  await walk(process.env.ONEDRIVE_ROOT_ITEM_ID!, "");
  return items;
}

async function main() {
  const config = parseStorageConfig();
  if (config.provider !== "onedrive") {
    throw new Error(
      `STORAGE_PROVIDER is "${config.provider}". There is no remote store to reconcile against.`,
    );
  }

  const database = getDatabase();
  const [items, rows] = await Promise.all([
    listProviderItems(),
    database
      .query<CatalogueRow>(
        `SELECT file.storage_key, file.byte_size, file.file_role,
                file.technical_status, track.title,
                submission.status AS submission_status
         FROM catalog.audio_file file
         JOIN catalog.audio_asset asset ON asset.id = file.audio_asset_id
         JOIN workflow.submission_revision revision ON revision.id = asset.submission_revision_id
         JOIN workflow.submission submission ON submission.id = revision.submission_id
         LEFT JOIN catalog.track track ON track.id = submission.track_id
         WHERE file.storage_backend = 'onedrive' AND file.storage_key IS NOT NULL`,
      )
      .then((result) => result.rows),
  ]);

  const byKey = new Map(rows.map((row) => [row.storage_key, row]));
  const byPath = new Map(items.map((item) => [item.path, item]));

  console.log(`Provider objects : ${items.length}`);
  console.log(`Catalogue rows   : ${rows.length}\n`);

  const orphans = items.filter((item) => !byKey.has(item.path));
  const missing = rows.filter((row) => !byPath.has(row.storage_key));
  const unlabelled = items.filter(
    (item) => byKey.has(item.path) && !item.title,
  );
  const mismatched = items.filter((item) => {
    const row = byKey.get(item.path);
    return row && Number(row.byte_size) !== item.size;
  });

  console.log(`Objects with no catalogue row: ${orphans.length}`);
  for (const item of orphans) {
    console.log(`  ${item.path}  (${item.size} bytes)`);
  }

  // A row whose object is absent is not necessarily damage: an upload that was
  // cancelled before any bytes arrived leaves exactly this, and the draft is
  // simply unusable rather than corrupt. A row on a submitted Track is a
  // different matter.
  console.log(`\nCatalogue rows with no object: ${missing.length}`);
  for (const row of missing) {
    const concerning = row.submission_status !== "draft";
    console.log(
      `  ${concerning ? "!" : " "} ${row.storage_key}  (${row.title ?? "untitled"}, submission ${row.submission_status})`,
    );
  }

  console.log(`\nStored objects with no Title label: ${unlabelled.length}`);
  for (const item of unlabelled) console.log(`  ${item.path}`);
  if (unlabelled.length > 0) {
    console.log("  Run pnpm storage:describe to label them.");
  }

  console.log(`\nSize mismatches: ${mismatched.length}`);
  for (const item of mismatched) {
    const row = byKey.get(item.path);
    console.log(
      `  ${item.path}: provider ${item.size} bytes, catalogue ${row?.byte_size} bytes`,
    );
  }

  const serious =
    orphans.length +
    mismatched.length +
    unlabelled.length +
    missing.filter((row) => row.submission_status !== "draft").length;
  console.log(
    serious === 0
      ? "\nProvider and catalogue agree."
      : `\n${serious} discrepancy(ies) need attention.`,
  );
  await database.end();
  if (serious > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Storage audit failed",
  );
  process.exitCode = 1;
});
