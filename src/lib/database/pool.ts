import { Pool } from "pg";

/**
 * One pool per server process. On a long-lived server that is one pool; on a
 * serverless platform it is one pool per warm instance, and the instances
 * multiply under load. Ten connections each reaches a managed Postgres
 * connection limit quickly, and the failure arrives as timeouts on unrelated
 * requests, so the ceiling drops where instances are disposable.
 *
 * A pooler in front of Postgres (PgBouncer, or a provider's pooled connection
 * string) is what actually makes serverless safe here; this only keeps a
 * single instance from taking more than its share.
 */
function defaultPoolMax(): number {
  const configured = Number(process.env.DATABASE_POOL_MAX);
  if (Number.isInteger(configured) && configured > 0) {
    return Math.min(configured, 50);
  }
  return process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ? 3 : 10;
}

export function createPostgresPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    options: "-c search_path=auth,public",
    max: defaultPoolMax(),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    application_name: "times-soundvault",
  });
}
