import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { getDatabase } = await import("../src/lib/database/database");
  const { getCopyrightStatusCounts } =
    await import("../src/lib/copyright/repository");
  console.info(
    JSON.stringify(await getCopyrightStatusCounts(getDatabase()), null, 2),
  );
  await getDatabase().end();
}

void main();
