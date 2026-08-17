import { Pool } from "pg";

export function createPostgresPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    options: "-c search_path=auth,public",
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    application_name: "times-soundvault",
  });
}
