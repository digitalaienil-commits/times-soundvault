import { loadEnvConfig } from "@next/env";
import fs from "node:fs/promises";
import path from "node:path";

import { getDatabase } from "../src/lib/database/database";
import { CONTROLLED_TAXONOMY_TERMS } from "../src/lib/admin/controlled-taxonomy";

loadEnvConfig(process.cwd());

/**
 * Disposable runtime tables, ordered so that a single TRUNCATE statement can
 * clear mutually referencing tables. Migration ledgers
 * (`system.schema_migration`, `auth.soundvault_migration`) and the controlled
 * taxonomy are deliberately absent: they are configuration, not runtime data.
 */
const RUNTIME_TABLES = [
  "analysis.file_technical_result",
  "analysis.metadata_suggestion",
  "analysis.processing_job",
  "analysis.provider_run",
  "analysis.qc_issue",
  "analysis.revision_analysis",
  "analysis.webhook_event",
  "auth.access_audit_event",
  "auth.account",
  "auth.rateLimit",
  "auth.session",
  "auth.team_access",
  "auth.user",
  "auth.verification",
  "catalog.audio_asset",
  "catalog.audio_file",
  "catalog.composition",
  "catalog.composition_identifier",
  "catalog.track",
  "catalog.track_embedding",
  "catalog.track_identifier",
  "catalog.track_metadata",
  "catalog.track_publication_event",
  "catalog.track_search_document",
  "catalog.track_term_assignment",
  "media.delivery_job",
  "media.download_package",
  "media.playback_artifact",
  "planning.demand",
  "planning.demand_assignee",
  "planning.demand_event",
  "planning.demand_reference_track",
  "planning.demand_response",
  "planning.demand_term_requirement",
  "rights.copyright_batch",
  "rights.copyright_batch_item",
  "rights.copyright_check",
  "rights.copyright_check_event",
  "rights.copyright_eligibility_review",
  "rights.copyright_job",
  "rights.copyright_observation",
  "rights.rights_declaration",
  "rights.submission_acknowledgement",
  "rights.youtube_reference_link",
  "system.admin_audit_event",
  "system.integrity_finding",
  "system.maintenance_job",
  "system.rate_limit_counter",
  "system.worker_heartbeat",
  "workflow.ai_generation_record",
  "workflow.change_request",
  "workflow.change_request_item",
  "workflow.review_case",
  "workflow.review_check_item",
  "workflow.review_decision",
  "workflow.review_event",
  "workflow.review_metadata_draft",
  "workflow.review_note",
  "workflow.review_term_selection",
  "workflow.submission",
  "workflow.submission_batch",
  "workflow.submission_event",
  "workflow.submission_revision",
  "workflow.upload_event",
  "workflow.upload_session",
] as const;

/** Private generated roots. Source assets outside these roots are untouched. */
const ARTIFACT_ROOT_VARIABLES = [
  ["LOCAL_STORAGE_ROOT", ".soundvault-storage"],
  ["PROCESSING_TEMP_ROOT", ".soundvault-processing"],
  ["COPYRIGHT_TEMP_ROOT", ".soundvault-copyright"],
  ["MEDIA_TEMP_ROOT", ".soundvault-media"],
] as const;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function quoteQualifiedName(qualified: string): string {
  return qualified
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");
}

function describeTarget(databaseUrl: string) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port || "5432",
    database: url.pathname.slice(1),
    user: url.username,
  };
}

/**
 * Refuses anything that is not an unmistakably local database. A cleaned
 * development database is never a substitute for a freshly migrated production
 * database, so this command exists only to reset local runtime state.
 */
function assertLocalTarget(databaseUrl: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Runtime data cleanup is forbidden when NODE_ENV=production.",
    );
  }

  const target = describeTarget(databaseUrl);
  if (!LOCAL_HOSTNAMES.has(target.host)) {
    throw new Error(
      `Runtime data cleanup refuses the non-local database host "${target.host}". ` +
        "Only localhost databases may be cleaned by this command.",
    );
  }
  return target;
}

async function resolveArtifactRoots() {
  const roots: { variable: string; root: string; exists: boolean }[] = [];
  for (const [variable, fallback] of ARTIFACT_ROOT_VARIABLES) {
    const root = path.resolve(process.env[variable]?.trim() || fallback);
    const publicRoot = path.resolve(process.cwd(), "public");
    if (root === publicRoot || root.startsWith(`${publicRoot}${path.sep}`)) {
      throw new Error(`${variable} must not resolve inside public`);
    }
    if (root === path.resolve(process.cwd())) {
      throw new Error(`${variable} must not resolve to the repository root`);
    }
    roots.push({
      variable,
      root,
      exists: await fs
        .stat(root)
        .then(() => true)
        .catch(() => false),
    });
  }
  return roots;
}

async function countFiles(root: string): Promise<number> {
  const entries = await fs
    .readdir(root, { withFileTypes: true, recursive: true })
    .catch(() => []);
  return entries.filter((entry) => entry.isFile()).length;
}

async function main() {
  const confirmed = process.argv.includes("--confirm");
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const target = assertLocalTarget(databaseUrl);
  console.log("Target database");
  console.log(`  host     ${target.host}:${target.port}`);
  console.log(`  database ${target.database}`);
  console.log(`  user     ${target.user}`);
  console.log("");

  const database = getDatabase();
  const counts = await database.query<{ qualified: string; rows: string }>(
    `SELECT n.nspname || '.' || c.relname AS qualified,
            (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname),
              false, true, '')))[1]::text AS rows
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname || '.' || c.relname = ANY($1::text[])`,
    [[...RUNTIME_TABLES]],
  );

  const populated = counts.rows
    .filter((row) => Number(row.rows) > 0)
    .sort((a, b) => Number(b.rows) - Number(a.rows));
  const totalRows = populated.reduce((sum, row) => sum + Number(row.rows), 0);

  console.log(`Disposable runtime rows: ${totalRows}`);
  for (const row of populated) {
    console.log(`  ${row.qualified.padEnd(44)} ${row.rows}`);
  }
  console.log("");

  const testTerms = await database.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM catalog.taxonomy_term
      WHERE id <> ALL($1::uuid[]) ORDER BY slug`,
    [CONTROLLED_TAXONOMY_TERMS.map((term) => term.id)],
  );
  console.log(
    `Taxonomy terms outside the controlled set: ${testTerms.rowCount}`,
  );
  for (const term of testTerms.rows) {
    console.log(`  ${term.slug}`);
  }
  console.log(
    `Controlled taxonomy terms restored to: ${CONTROLLED_TAXONOMY_TERMS.length}`,
  );
  console.log("");

  const roots = await resolveArtifactRoots();
  console.log("Private generated artifact roots");
  for (const entry of roots) {
    const files = entry.exists ? await countFiles(entry.root) : 0;
    console.log(
      `  ${entry.variable.padEnd(22)} ${entry.root} ${
        entry.exists ? `(${files} files)` : "(absent)"
      }`,
    );
  }
  console.log("");

  console.log(
    "Preserved: migrations, schema definitions, controlled taxonomy, automated tests and source code.",
  );

  if (!confirmed) {
    console.log("");
    console.log(
      "Dry run only. Re-run with --confirm to delete the runtime records and generated artifacts listed above.",
    );
    await database.end();
    return;
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const controlledIds = CONTROLLED_TAXONOMY_TERMS.map((term) => term.id);

    // The controlled taxonomy is preserved configuration, so it stays out of
    // the TRUNCATE set. That leaves its foreign keys pointing at `auth.user`,
    // which PostgreSQL checks per constraint rather than per row, so the
    // identities are removed with DELETE after everything else is truncated.
    await client.query(
      `TRUNCATE TABLE ${RUNTIME_TABLES.filter((table) => table !== "auth.user")
        .map(quoteQualifiedName)
        .join(", ")} RESTART IDENTITY`,
    );
    await client.query(
      `UPDATE catalog.taxonomy_term
          SET updated_by_user_id = NULL, deactivated_by_user_id = NULL
        WHERE updated_by_user_id IS NOT NULL
           OR deactivated_by_user_id IS NOT NULL`,
    );
    await client.query(
      `UPDATE catalog.taxonomy_term_alias
          SET created_by_user_id = NULL
        WHERE created_by_user_id IS NOT NULL`,
    );
    await client.query(`DELETE FROM auth."user"`);

    await client.query(
      `DELETE FROM catalog.taxonomy_term_alias
        WHERE term_id <> ALL($1::uuid[])`,
      [controlledIds],
    );
    await client.query(
      `DELETE FROM catalog.taxonomy_term WHERE id <> ALL($1::uuid[])`,
      [controlledIds],
    );
    await client.query(
      `INSERT INTO catalog.taxonomy_term (id, category, slug, label)
       SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::text[])
       ON CONFLICT (category, slug) DO NOTHING`,
      [
        CONTROLLED_TAXONOMY_TERMS.map((term) => term.id),
        CONTROLLED_TAXONOMY_TERMS.map((term) => term.category),
        CONTROLLED_TAXONOMY_TERMS.map((term) => term.slug),
        CONTROLLED_TAXONOMY_TERMS.map((term) => term.label),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  console.log("Runtime records removed and controlled taxonomy restored.");

  for (const entry of roots) {
    if (!entry.exists) continue;
    for (const child of await fs.readdir(entry.root)) {
      await fs.rm(path.join(entry.root, child), {
        recursive: true,
        force: true,
      });
    }
    console.log(`Cleared generated artifacts under ${entry.root}`);
  }

  await database.end();
  console.log("");
  console.log(
    "Cleanup complete. Run pnpm auth:seed-local to recreate local development identities.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Runtime data cleanup failed",
  );
  process.exitCode = 1;
});
