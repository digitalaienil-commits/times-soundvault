import type { QueryResultRow } from "pg";
import { createPostgresPool } from "@/lib/database/pool";
import { getScriptEnvironment } from "./environment";

async function main() {
  const pool = createPostgresPool(getScriptEnvironment().databaseUrl);
  try {
    const result = await pool.query<
      { subject: string; status: string; count: string } & QueryResultRow
    >(`SELECT 'artifact' AS subject,status,count(*)::text FROM media.playback_artifact GROUP BY status
       UNION ALL
       SELECT 'job',status,count(*)::text FROM media.delivery_job GROUP BY status
       UNION ALL
       SELECT 'package',status,count(*)::text FROM media.download_package GROUP BY status
       ORDER BY subject,status`);
    result.rows.forEach((row) =>
      console.info(`${row.subject} ${row.status}: ${row.count}`),
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Media status failed");
  process.exitCode = 1;
});
