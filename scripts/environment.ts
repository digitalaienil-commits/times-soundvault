import { loadEnvConfig } from "@next/env";

import { parseAuthEnvironment } from "@/lib/auth/environment-schema";

export function getScriptEnvironment() {
  loadEnvConfig(process.cwd());
  return parseAuthEnvironment(process.env);
}
