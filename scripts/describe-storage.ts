import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { getDatabase } from "../src/lib/database/database";
import { describeStoredAudio } from "../src/lib/domain/uploads/describe";

/**
 * Labels every stored object with the Track it belongs to.
 *
 * New uploads are labelled as they complete. This covers everything that was
 * stored before that existed, and is safe to re-run: the labels are derived
 * from the catalogue each time, so it also repairs anything that has since
 * been retitled.
 */
async function main() {
  const database = getDatabase();
  const files = await database.query<{ id: string; storage_key: string }>(
    `SELECT file.id, file.storage_key
     FROM catalog.audio_file file
     WHERE file.storage_key IS NOT NULL AND file.storage_backend <> 'local'
     ORDER BY file.file_role, file.storage_key`,
  );

  if (files.rows.length === 0) {
    console.log(
      "Nothing to label: no objects on a provider that stores labels.",
    );
    await database.end();
    return;
  }

  console.log(`Labelling ${files.rows.length} stored objects.\n`);
  let labelled = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of files.rows) {
    try {
      const done = await describeStoredAudio(database, row.id);
      if (done) {
        console.log(`  OK    ${row.storage_key}`);
        labelled += 1;
      } else {
        console.log(`  SKIP  ${row.storage_key}  (backend stores no labels)`);
        skipped += 1;
      }
    } catch (error) {
      console.log(
        `  FAIL  ${row.storage_key}\n        ${error instanceof Error ? error.message : String(error)}`,
      );
      failed += 1;
    }
  }
  console.log(`\nLabelled ${labelled}, skipped ${skipped}, failed ${failed}.`);
  await database.end();
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Storage labelling failed",
  );
  process.exitCode = 1;
});
