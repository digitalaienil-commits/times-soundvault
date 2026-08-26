import { runOneMediaJob } from "@/lib/media/worker";
import { getScriptEnvironment } from "./environment";
import { getDatabase } from "@/lib/database/database";

getScriptEnvironment();
runOneMediaJob()
  .then(async (result) => {
    console.info(
      result.processed ? "Processed one media job." : "No media job is ready.",
    );
    await getDatabase().end();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Media job failed");
    process.exitCode = 1;
  });
