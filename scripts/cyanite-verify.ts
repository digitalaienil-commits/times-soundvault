import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { createMusicAnalysisProvider } =
    await import("../src/lib/analysis/factory");
  const provider = createMusicAnalysisProvider();
  if (!provider) {
    console.info(
      "Skipped live Cyanite verification: CYANITE_ENABLED is false.",
    );
    return;
  }
  console.info((await provider.verifyConnection()).message);
}
void main();
