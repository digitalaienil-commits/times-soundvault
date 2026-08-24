import "server-only";

import { CyaniteClient } from "./cyanite/client";
import { parseCyaniteConfig } from "./cyanite/config";

export function createMusicAnalysisProvider(): CyaniteClient | null {
  const config = parseCyaniteConfig();
  return config.enabled ? new CyaniteClient(config) : null;
}
