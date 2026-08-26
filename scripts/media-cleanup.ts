import { createStorageProviderForKind } from "@/lib/storage/factory";
import { getDatabase } from "@/lib/database/database";
import { getScriptEnvironment } from "./environment";

async function main() {
  getScriptEnvironment();
  const apply = process.argv.includes("--apply");
  const result = await getDatabase().query<{
    id: string;
    storage_backend: "local" | "onedrive";
    storage_key: string;
    provider_drive_id: string | null;
    provider_item_id: string | null;
  }>(`SELECT id,storage_backend,storage_key,provider_drive_id,provider_item_id
     FROM media.download_package
     WHERE status='ready' AND expires_at <= now()`);
  console.info(
    `${result.rowCount ?? 0} expired package(s) found. ${apply ? "Applying cleanup." : "Dry run only."}`,
  );
  if (!apply) {
    await getDatabase().end();
    return;
  }
  for (const row of result.rows) {
    await createStorageProviderForKind(
      row.storage_backend,
    ).deleteGeneratedObject({
      storageKey: row.storage_key,
      providerDriveId: row.provider_drive_id,
      providerItemId: row.provider_item_id,
    });
    await getDatabase().query(
      `UPDATE media.download_package
       SET status='expired',storage_key=NULL,provider_drive_id=NULL,
           provider_item_id=NULL WHERE id=$1`,
      [row.id],
    );
  }
  await getDatabase().end();
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Media cleanup failed",
  );
  process.exitCode = 1;
});
