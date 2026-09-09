import { getDatabase } from "@/lib/database/database";
import { parseMediaConfig } from "@/lib/media/config";
import { runOneMediaJob } from "@/lib/media/worker";
import { getScriptEnvironment } from "./environment";

async function main() {
  getScriptEnvironment();
  const config = parseMediaConfig();
  let stopping = false;
  process.once("SIGINT", () => {
    stopping = true;
  });
  process.once("SIGTERM", () => {
    stopping = true;
  });
  try {
    while (!stopping) {
      const results = await Promise.all(
        Array.from({ length: config.jobConcurrency }, (_, index) =>
          runOneMediaJob(`media-${process.pid}-${index}`),
        ),
      );
      if (!results.some((result) => result.processed)) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  } finally {
    // The connection pool keeps the event loop alive, so without this the
    // worker ignores SIGTERM and a rolling restart has to kill it.
    await getDatabase().end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Media worker failed");
  process.exitCode = 1;
});
