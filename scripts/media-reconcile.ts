import { reconcileMediaJobs } from "@/lib/media/worker";
import { getScriptEnvironment } from "./environment";
import { getDatabase } from "@/lib/database/database";

getScriptEnvironment();
reconcileMediaJobs()
  .then(async (result) => {
    console.info(JSON.stringify(result));
    await getDatabase().end();
  })
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Media reconciliation failed",
    );
    process.exitCode = 1;
  });
