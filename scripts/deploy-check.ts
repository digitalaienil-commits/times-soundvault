import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/**
 * Validates a deployment environment before it reaches a build.
 *
 * Every parser here also runs at request time, so the failures it reports
 * would happen anyway — just later, on a live URL, as a 500 with a reference
 * id. Running them against the variables intended for the target environment
 * moves that to before the deploy.
 *
 * It reads configuration only. It contacts nothing and prints no secret.
 */
interface Check {
  name: string;
  run: () => void | Promise<void>;
}

/**
 * The environment is parsed as production regardless of where this runs:
 * several rules only apply there, and they are the ones worth catching early
 * — local sign-in forbidden, HTTPS origins required.
 */
const PRODUCTION_ENVIRONMENT: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
};

async function main() {
  const [
    { parseAuthEnvironment },
    { parseStorageConfig },
    { parseAiAnalysisConfig },
    { parseCopyrightConfig },
  ] = await Promise.all([
    import("../src/lib/auth/environment-schema"),
    import("../src/lib/storage/config"),
    import("../src/lib/analysis/config"),
    import("../src/lib/copyright/config"),
  ]);

  const checks: Check[] = [
    {
      name: "Authentication",
      run: () => {
        const auth = parseAuthEnvironment(PRODUCTION_ENVIRONMENT);
        if (!auth.databaseUrl) throw new Error("DATABASE_URL is required");
      },
    },
    {
      name: "Storage",
      run: () => {
        const storage = parseStorageConfig(PRODUCTION_ENVIRONMENT);
        if (storage.provider === "local") {
          throw new Error(
            "STORAGE_PROVIDER=local writes to the server filesystem, which a serverless deployment discards between requests. Use onedrive.",
          );
        }
        if (storage.chunkBytes > 4 * 1024 * 1024 && process.env.VERCEL) {
          throw new Error(
            `UPLOAD_CHUNK_BYTES is ${storage.chunkBytes}; Vercel rejects request bodies over 4.5 MB and every upload would fail`,
          );
        }
      },
    },
    {
      name: "AI analysis",
      run: () => void parseAiAnalysisConfig(PRODUCTION_ENVIRONMENT),
    },
    {
      name: "Copyright",
      run: () => void parseCopyrightConfig(PRODUCTION_ENVIRONMENT),
    },
  ];

  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`  OK    ${check.name}`);
    } catch (error) {
      console.log(
        `  FAIL  ${check.name}\n        ${error instanceof Error ? error.message : String(error)}`,
      );
      failed += 1;
    }
  }

  // Worth saying out loud rather than leaving to be discovered: the queues do
  // not run here. Nothing in this repository can check that they run anywhere.
  console.log(
    "\nBackground workers (processing, media, copyright, embedding) are long-running\n" +
      "processes and are not part of this deployment. Without them, uploads are stored\n" +
      "but never analysed. Run them on a host that allows long-lived processes and\n" +
      "ffmpeg. See docs/deployment-runbook.md.",
  );

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("\nConfiguration is deployable.");
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Deployment check failed",
  );
  process.exitCode = 1;
});
