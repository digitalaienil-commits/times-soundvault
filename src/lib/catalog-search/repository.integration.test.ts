import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { defaultCatalogSearchInput } from "./validation";
import {
  getPublishedTrackDetailRow,
  getSearchDocumentStatus,
  listPublishedCatalogFacets,
  searchPublishedCatalogRows,
} from "./repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

databaseDescribe("Section 9 PostgreSQL published library", () => {
  let pool: Pool;
  let publishedTrackId: string;
  let draftTrackId: string;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE catalog.track_publication_event, workflow.change_request_item,
      workflow.change_request, workflow.review_decision, workflow.review_event, workflow.review_note,
      workflow.review_check_item, workflow.review_term_selection, workflow.review_metadata_draft,
      workflow.review_case, rights.copyright_check_event, rights.copyright_observation,
      rights.copyright_eligibility_review, rights.copyright_check, rights.rights_declaration,
      analysis.metadata_suggestion, analysis.provider_run, analysis.qc_issue,
      analysis.file_technical_result, analysis.processing_job, analysis.revision_analysis,
      catalog.track_term_assignment, catalog.taxonomy_term, catalog.track_metadata,
      catalog.audio_file, catalog.audio_asset, workflow.submission_event,
      workflow.submission_revision, workflow.submission, workflow.submission_batch,
      catalog.track_identifier, catalog.track, catalog.composition_identifier,
      catalog.composition, auth.access_audit_event, auth.team_access, auth.session,
      auth.account, auth."user" CASCADE`);
    const userId = `search-${randomUUID()}`;
    await pool.query(
      `INSERT INTO auth."user" (id,name,email,"emailVerified","createdAt","updatedAt",role)
      VALUES ($1,'Search owner',$2,true,now(),now(),'music_producer')`,
      [userId, `${randomUUID()}@soundvault.test`],
    );
    publishedTrackId = randomUUID();
    draftTrackId = randomUUID();
    const submissionId = randomUUID();
    const revisionId = randomUUID();
    await pool.query(
      `INSERT INTO catalog.track (id,asset_kind,title,description,created_by_user_id)
      VALUES ($1,'music','Breaking Bulletin Bed','Urgent election headlines',$3),
             ($2,'music','Breaking Bulletin Bed','Private producer note',$3)`,
      [publishedTrackId, draftTrackId, userId],
    );
    await pool.query(
      `INSERT INTO workflow.submission
      (id,track_id,owner_user_id,status,current_revision_id,latest_revision_number)
      VALUES ($1,$2,$3,'approved',NULL,0)`,
      [submissionId, publishedTrackId, userId],
    );
    await pool.query(
      `INSERT INTO workflow.submission_revision
      (id,submission_id,revision_number,created_by_user_id,revision_status,producer_metadata,submitted_at)
      VALUES ($1,$2,1,$3,'accepted','{}'::jsonb,now())`,
      [revisionId, submissionId, userId],
    );
    await pool.query(
      `UPDATE workflow.submission SET current_revision_id=$2,latest_revision_number=1 WHERE id=$1`,
      [submissionId, revisionId],
    );
    await pool.query(
      `INSERT INTO catalog.track_metadata
      (track_id,description_caption,bpm,key_tonic,key_mode,energy_score,vocal_state,language_code,under_dialogue,loopable,ending_type)
      VALUES ($1,'High-energy breaking news underscore',126,'D','minor',0.82,'instrumental','en',true,true,'clean_stop')`,
      [publishedTrackId],
    );
    const termId = randomUUID();
    await pool.query(
      `INSERT INTO catalog.taxonomy_term (id,category,slug,label)
      VALUES ($1,'use_case','breaking-news','Breaking News')`,
      [termId],
    );
    await pool.query(
      `INSERT INTO catalog.track_term_assignment
      (id,track_id,term_id,source_kind,review_status)
      VALUES ($1,$2,$3,'coordinator','accepted')`,
      [randomUUID(), publishedTrackId, termId],
    );
    await pool.query(
      `INSERT INTO catalog.track_identifier
      (id,track_id,identifier_type,identifier_value)
      VALUES ($1,$2,'custom','SV-NEWS-001')`,
      [randomUUID(), publishedTrackId],
    );
    await pool.query(
      `UPDATE catalog.track SET publication_status='published',published_revision_id=$2,
      published_by_user_id=$3,published_at=now() WHERE id=$1`,
      [publishedTrackId, revisionId, userId],
    );
  });
  afterAll(async () => {
    await pool.end();
  });

  it("searches title, identifier, typo and news metadata", async () => {
    for (const query of ["breaking", "SV-NEWS-001", "Breakng Bulletin"]) {
      const result = await searchPublishedCatalogRows(pool, {
        ...defaultCatalogSearchInput(),
        query,
      });
      expect(
        result.items.map((item) => item.trackId),
        query,
      ).toEqual([publishedTrackId]);
    }
    const filtered = await searchPublishedCatalogRows(pool, {
      ...defaultCatalogSearchInput(),
      useCases: ["breaking-news"],
      underDialogue: true,
      bpmMin: 120,
      bpmMax: 130,
    });
    expect(filtered.total).toBe(1);
  });

  it("never exposes drafts and removes a withdrawn document", async () => {
    const result = await searchPublishedCatalogRows(pool, {
      ...defaultCatalogSearchInput(),
      query: "Breaking Bulletin Bed",
    });
    expect(result.items.map((item) => item.trackId)).toEqual([
      publishedTrackId,
    ]);
    expect(result.items.map((item) => item.trackId)).not.toContain(
      draftTrackId,
    );
    expect(await getPublishedTrackDetailRow(pool, draftTrackId)).toBeNull();
    await pool.query(
      `UPDATE catalog.track SET publication_status='withdrawn' WHERE id=$1`,
      [publishedTrackId],
    );
    expect(await getPublishedTrackDetailRow(pool, publishedTrackId)).toBeNull();
    expect(await getSearchDocumentStatus(pool)).toMatchObject({
      searchDocuments: 0,
      nonPublishedDocuments: 0,
    });
  });

  it("returns accepted active facets and canonical-safe detail", async () => {
    expect(await listPublishedCatalogFacets(pool, true)).toEqual([
      {
        category: "use_case",
        label: "Use Case",
        options: [{ slug: "breaking-news", label: "Breaking News", count: 1 }],
      },
    ]);
    expect(
      await getPublishedTrackDetailRow(pool, publishedTrackId),
    ).toMatchObject({
      title: "Breaking Bulletin Bed",
      descriptionCaption: "High-energy breaking news underscore",
      identifiers: [{ type: "custom", value: "SV-NEWS-001" }],
    });
  });
});
