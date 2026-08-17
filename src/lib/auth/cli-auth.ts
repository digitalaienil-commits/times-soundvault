import { loadEnvConfig } from "@next/env";

import { createPostgresPool } from "@/lib/database/pool";

import { createSoundVaultAuth } from "./auth-factory";
import { parseAuthEnvironment } from "./environment-schema";

loadEnvConfig(process.cwd());

const environment = parseAuthEnvironment(process.env);

export const auth = createSoundVaultAuth(
  environment,
  createPostgresPool(environment.databaseUrl),
);
