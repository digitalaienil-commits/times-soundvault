import { performance } from "node:perf_hooks";

import { createPostgresPool } from "@/lib/database/pool";

import { getScriptEnvironment } from "./environment";

async function main() {
  const pool = createPostgresPool(getScriptEnvironment().databaseUrl);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE catalog.track DISABLE TRIGGER USER");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    const startedAt = performance.now();
    const userId = `benchmark-${Date.now()}`;
    await client.query(
      `INSERT INTO auth."user" (id,name,email,"emailVerified","createdAt","updatedAt",role)
       VALUES ($1,'Search benchmark',$2,true,now(),now(),'admin')`,
      [userId, `${userId}@soundvault.test`],
    );
    await client.query(
      `CREATE TEMP TABLE benchmark_generated ON COMMIT DROP AS
         SELECT value,
                (substr(md5('benchmark-track-' || value),1,8)||'-'||substr(md5('benchmark-track-' || value),9,4)||'-4'||substr(md5('benchmark-track-' || value),14,3)||'-8'||substr(md5('benchmark-track-' || value),18,3)||'-'||substr(md5('benchmark-track-' || value),21,12))::uuid AS track_id,
                (substr(md5('benchmark-submission-' || value),1,8)||'-'||substr(md5('benchmark-submission-' || value),9,4)||'-4'||substr(md5('benchmark-submission-' || value),14,3)||'-8'||substr(md5('benchmark-submission-' || value),18,3)||'-'||substr(md5('benchmark-submission-' || value),21,12))::uuid AS submission_id,
                (substr(md5('benchmark-revision-' || value),1,8)||'-'||substr(md5('benchmark-revision-' || value),9,4)||'-4'||substr(md5('benchmark-revision-' || value),14,3)||'-8'||substr(md5('benchmark-revision-' || value),18,3)||'-'||substr(md5('benchmark-revision-' || value),21,12))::uuid AS revision_id
         FROM generate_series(1,10000) value`,
    );
    await client.query(
      `INSERT INTO catalog.track (id,asset_kind,title,description,created_by_user_id)
      SELECT track_id,'music',CASE WHEN value % 100=0 THEN 'Breaking News Bed '||value ELSE 'Catalog Track '||value END,
      'Synthetic published canonical catalog record '||value,$1 FROM benchmark_generated`,
      [userId],
    );
    await client.query(
      `INSERT INTO workflow.submission (id,track_id,owner_user_id,status,current_revision_id,latest_revision_number)
      SELECT submission_id,track_id,$1,'approved',NULL,0 FROM benchmark_generated`,
      [userId],
    );
    await client.query(
      `INSERT INTO workflow.submission_revision (id,submission_id,revision_number,created_by_user_id,revision_status,producer_metadata,submitted_at)
      SELECT revision_id,submission_id,1,$1,'accepted','{}'::jsonb,now() FROM benchmark_generated`,
      [userId],
    );
    await client.query(`UPDATE workflow.submission submission SET current_revision_id=generated.revision_id,latest_revision_number=1
      FROM benchmark_generated generated WHERE submission.id=generated.submission_id`);
    await client.query(
      `UPDATE catalog.track track SET publication_status='published',published_revision_id=generated.revision_id,
      published_by_user_id=$1,published_at=now()-generated.value*interval '1 second'
      FROM benchmark_generated generated WHERE track.id=generated.track_id`,
      [userId],
    );
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("ALTER TABLE catalog.track ENABLE TRIGGER USER");
    const refresh = await client.query<{ refreshed_count: string }>(
      `SELECT refreshed_count::text
       FROM catalog.refresh_track_search_documents(
         ARRAY(SELECT track_id FROM benchmark_generated)
       )`,
    );
    await client.query("ANALYZE catalog.track");
    await client.query("ANALYZE catalog.track_search_document");
    const plan = await client.query<{ "QUERY PLAN": string }>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT track.id
       FROM catalog.track_search_document document
       JOIN catalog.track track ON track.id=document.track_id
       WHERE track.publication_status='published'
         AND document.published_revision_id=track.published_revision_id
         AND document.search_vector @@ websearch_to_tsquery('english','breaking news')
       ORDER BY ts_rank_cd(document.search_vector,websearch_to_tsquery('english','breaking news')) DESC
       LIMIT 30`,
    );
    console.info(
      JSON.stringify(
        {
          syntheticTracks: 10_000,
          refreshedDocuments: Number(refresh.rows[0]?.refreshed_count ?? 0),
          setupMilliseconds: Math.round(performance.now() - startedAt),
          plan: plan.rows.map((row) => row["QUERY PLAN"]),
        },
        null,
        2,
      ),
    );
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Search benchmark failed",
  );
  process.exitCode = 1;
});
