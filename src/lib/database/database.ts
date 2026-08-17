import "server-only";

import type { Pool } from "pg";

import { getAuthEnvironment } from "@/lib/auth/environment";

import { createPostgresPool } from "./pool";

declare global {
  var soundVaultPostgresPool: Pool | undefined;
}

export function getDatabase(): Pool {
  if (!globalThis.soundVaultPostgresPool) {
    globalThis.soundVaultPostgresPool = createPostgresPool(
      getAuthEnvironment().databaseUrl,
    );
  }

  return globalThis.soundVaultPostgresPool;
}
