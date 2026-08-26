import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import type { CurrentUser } from "@/types/auth";

import {
  acceptResponse,
  createDemand,
  DemandRepositoryError,
  getDemandDetail,
  listDemands,
  proposeCatalogTrack,
  submitOrRefreshResponse,
  transitionDemand,
  updateDemand,
  withdrawResponse,
} from "./repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

databaseDescribe("Section 11 Demand repository", () => {
  let pool: Pool;
  let coordinator: CurrentUser;
  let producerOne: CurrentUser;
  let producerTwo: CurrentUser;
  let useCaseTermId: string;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE
      planning.demand_event, planning.demand_response,
      planning.demand_reference_track, planning.demand_assignee,
      planning.demand_term_requirement, planning.demand,
      catalog.track_publication_event, workflow.change_request_item,
      workflow.change_request, workflow.review_decision, workflow.review_event,
      workflow.review_note, workflow.review_check_item,
      workflow.review_term_selection, workflow.review_metadata_draft,
      workflow.review_case, rights.copyright_check_event,
      rights.copyright_observation, rights.copyright_eligibility_review,
      rights.copyright_check, rights.rights_declaration,
      analysis.metadata_suggestion, analysis.provider_run, analysis.qc_issue,
      analysis.file_technical_result, analysis.processing_job,
      analysis.revision_analysis, catalog.track_term_assignment,
      catalog.taxonomy_term, catalog.track_metadata, catalog.audio_file,
      catalog.audio_asset, workflow.submission_event,
      workflow.submission_revision, workflow.submission,
      workflow.submission_batch, catalog.track_identifier, catalog.track,
      catalog.composition_identifier, catalog.composition,
      auth.access_audit_event, auth.team_access, auth.session, auth.account,
      auth."user" CASCADE`);
    coordinator = await insertUser("coordinator");
    producerOne = await insertUser("music_producer");
    producerTwo = await insertUser("music_producer");
    useCaseTermId = randomUUID();
    await pool.query(
      `INSERT INTO catalog.taxonomy_term (id,category,slug,label)
       VALUES ($1,'use_case','brand-film','Brand Film')`,
      [useCaseTermId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function insertUser(role: CurrentUser["role"]): Promise<CurrentUser> {
    const id = `${role}-${randomUUID()}`;
    const email = `${randomUUID()}@soundvault.test`;
    const name = `${role} Demand user`;
    await pool.query(
      `INSERT INTO auth."user" (id,name,email,"emailVerified","createdAt","updatedAt",role)
       VALUES ($1,$2,$3,true,now(),now(),$4)`,
      [id, name, email, role],
    );
    await pool.query(
      `INSERT INTO auth.team_access
       (id,normalized_email,display_name,role,status,auth_user_id,provider,provider_account_id,activated_at)
       VALUES ($1,lower($2),$3,$4,'active',$5,'local',$2,now())`,
      [randomUUID(), email, name, role, id],
    );
    return { id, email, name, role, initials: "DU", accessStatus: "active" };
  }

  function demandInput(intent: "draft" | "open" = "open") {
    return {
      title: "Brand film music request",
      requesterName: "Brand Studio",
      requestingTeam: "Marketing",
      projectContext: "National campaign film",
      brief: "Warm and confident internal music for a national campaign film.",
      creativeNotes: null,
      avoidNotes: null,
      priority: "high" as const,
      assetKind: "music" as const,
      targetTrackCount: 1,
      responseDeadlineOn: "2099-09-01",
      neededByOn: "2099-09-05",
      bpmMin: null,
      bpmMax: null,
      durationMinMs: null,
      durationMaxMs: null,
      vocalState: null,
      underDialogue: null,
      loopable: null,
      stemsRequired: false,
      endingType: null,
      ownerUserId: coordinator.id,
      termRequirements: [
        { termId: useCaseTermId, importance: "required" as const },
      ],
      assigneeUserIds: [producerOne.id],
      referenceTrackIds: [],
      intent,
    };
  }

  async function publishedTrack(owner: CurrentUser, title: string) {
    const trackId = randomUUID();
    const submissionId = randomUUID();
    const revisionId = randomUUID();
    await pool.query(
      `INSERT INTO catalog.track (id,asset_kind,title,created_by_user_id)
       VALUES ($1,'music',$2,$3)`,
      [trackId, title, owner.id],
    );
    await pool.query(
      `INSERT INTO workflow.submission
       (id,track_id,owner_user_id,status,current_revision_id,latest_revision_number)
       VALUES ($1,$2,$3,'approved',NULL,0)`,
      [submissionId, trackId, owner.id],
    );
    await pool.query(
      `INSERT INTO workflow.submission_revision
       (id,submission_id,revision_number,created_by_user_id,revision_status,producer_metadata,submitted_at)
       VALUES ($1,$2,1,$3,'accepted','{}'::jsonb,now())`,
      [revisionId, submissionId, owner.id],
    );
    await pool.query(
      `UPDATE workflow.submission SET current_revision_id=$2,latest_revision_number=1 WHERE id=$1`,
      [submissionId, revisionId],
    );
    await pool.query(
      `UPDATE catalog.track SET publication_status='published',published_revision_id=$2,
       published_by_user_id=$3,published_at=now() WHERE id=$1`,
      [trackId, revisionId, coordinator.id],
    );
    await pool.query(
      `INSERT INTO catalog.track_term_assignment
       (id,track_id,term_id,source_kind,review_status)
       VALUES ($1,$2,$3,'coordinator','accepted')`,
      [randomUUID(), trackId, useCaseTermId],
    );
    return { trackId, revisionId };
  }

  it("hides drafts from Producers and rejects a stale concurrent edit", async () => {
    const draftId = await createDemand(pool, coordinator, demandInput("draft"));
    const openId = await createDemand(pool, coordinator, demandInput("open"));
    expect(
      (await listDemands(pool, producerOne, { status: "all" })).items.map(
        (demand) => demand.id,
      ),
    ).toEqual([openId]);
    expect(await getDemandDetail(pool, draftId, producerOne)).toBeNull();

    const current = await getDemandDetail(pool, openId, coordinator);
    expect(current).not.toBeNull();
    await updateDemand(pool, coordinator, {
      ...demandInput("open"),
      title: "Updated brand film music request",
      demandId: openId,
      rowVersion: current!.rowVersion,
    });
    await expect(
      updateDemand(pool, coordinator, {
        ...demandInput("open"),
        demandId: openId,
        rowVersion: current!.rowVersion,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps Producer responses private and fulfills only after valid acceptance", async () => {
    const demandId = await createDemand(pool, coordinator, demandInput());
    const first = await publishedTrack(producerOne, "Warm brand theme");
    const second = await publishedTrack(producerTwo, "Alternative brand theme");
    await proposeCatalogTrack(pool, producerOne, {
      demandId,
      trackId: first.trackId,
      pitchNote: "Matches the requested warm direction.",
    });
    await proposeCatalogTrack(pool, producerTwo, {
      demandId,
      trackId: second.trackId,
    });

    expect(
      (await getDemandDetail(pool, demandId, producerOne))?.responses,
    ).toHaveLength(1);
    const managed = await getDemandDetail(pool, demandId, coordinator);
    expect(managed?.responses).toHaveLength(2);
    expect(
      managed?.responses.map((response) => response.responderName),
    ).not.toContain(null);

    await expect(
      transitionDemand(pool, coordinator, {
        demandId,
        rowVersion: managed!.rowVersion,
        nextStatus: "fulfilled",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const selected = managed!.responses.find(
      (response) => response.trackId === first.trackId,
    )!;
    await acceptResponse(pool, coordinator, {
      demandId,
      responseId: selected.id,
      rowVersion: selected.rowVersion,
    });
    const accepted = await getDemandDetail(pool, demandId, coordinator);
    expect(accepted?.coverage.validAccepted).toBe(1);
    await transitionDemand(pool, coordinator, {
      demandId,
      rowVersion: accepted!.rowVersion,
      nextStatus: "fulfilled",
    });
    expect((await getDemandDetail(pool, demandId, coordinator))?.status).toBe(
      "fulfilled",
    );
    await pool.query(
      `UPDATE catalog.track SET publication_status='withdrawn',withdrawn_at=now() WHERE id=$1`,
      [first.trackId],
    );
    const attention = await getDemandDetail(pool, demandId, coordinator);
    expect(attention).toMatchObject({
      status: "fulfilled",
      fulfillmentNeedsAttention: true,
      coverage: { accepted: 1, validAccepted: 0 },
    });
  });

  it("versions only post-open material edits and requires stale responses to refresh", async () => {
    const demandId = await createDemand(
      pool,
      coordinator,
      demandInput("draft"),
    );
    let demand = (await getDemandDetail(pool, demandId, coordinator))!;
    await updateDemand(pool, coordinator, {
      ...demandInput("draft"),
      brief: "A changed draft brief that is still long enough for validation.",
      demandId,
      rowVersion: demand.rowVersion,
    });
    demand = (await getDemandDetail(pool, demandId, coordinator))!;
    expect(demand.briefVersion).toBe(1);
    await transitionDemand(pool, coordinator, {
      demandId,
      rowVersion: demand.rowVersion,
      nextStatus: "open",
    });
    demand = (await getDemandDetail(pool, demandId, coordinator))!;
    await updateDemand(pool, coordinator, {
      ...demandInput("open"),
      brief: demand.brief,
      title: "Renamed request without creative change",
      priority: "urgent",
      responseDeadlineOn: "2099-09-02",
      neededByOn: "2099-09-06",
      assigneeUserIds: [producerTwo.id],
      demandId,
      rowVersion: demand.rowVersion,
    });
    demand = (await getDemandDetail(pool, demandId, coordinator))!;
    expect(demand.briefVersion).toBe(1);

    const track = await publishedTrack(producerOne, "Brief-version theme");
    await proposeCatalogTrack(pool, producerOne, {
      demandId,
      trackId: track.trackId,
    });
    const submitted = (await getDemandDetail(pool, demandId, coordinator))!
      .responses[0]!;
    await updateDemand(pool, coordinator, {
      ...demandInput("open"),
      brief: "Materially updated music direction for the campaign response.",
      demandId,
      rowVersion: demand.rowVersion,
    });
    demand = (await getDemandDetail(pool, demandId, coordinator))!;
    expect(demand.briefVersion).toBe(2);
    expect(demand.responses[0]?.briefChanged).toBe(true);
    await expect(
      acceptResponse(pool, coordinator, {
        demandId,
        responseId: submitted.id,
        rowVersion: submitted.rowVersion,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await submitOrRefreshResponse(pool, producerOne, {
      demandId,
      responseId: submitted.id,
      rowVersion: submitted.rowVersion,
    });
    const refreshed = (await getDemandDetail(pool, demandId, coordinator))!
      .responses[0]!;
    expect(refreshed.briefVersionSubmitted).toBe(2);
    expect(refreshed.briefChanged).toBe(false);
  });

  it("blocks Required mismatches and a changed published Revision until refresh", async () => {
    const demandId = await createDemand(pool, coordinator, demandInput());
    const track = await publishedTrack(producerOne, "Revision-sensitive theme");
    await pool.query(
      `DELETE FROM catalog.track_term_assignment WHERE track_id=$1`,
      [track.trackId],
    );
    await proposeCatalogTrack(pool, producerOne, {
      demandId,
      trackId: track.trackId,
    });
    let response = (await getDemandDetail(pool, demandId, coordinator))!
      .responses[0]!;
    await expect(
      acceptResponse(pool, coordinator, {
        demandId,
        responseId: response.id,
        rowVersion: response.rowVersion,
      }),
    ).rejects.toMatchObject({ code: "FIT_BLOCKED" });

    await pool.query(
      `INSERT INTO catalog.track_term_assignment
       (id,track_id,term_id,source_kind,review_status)
       VALUES ($1,$2,$3,'coordinator','accepted')`,
      [randomUUID(), track.trackId, useCaseTermId],
    );
    const submission = await pool.query<{ id: string }>(
      `SELECT id FROM workflow.submission WHERE track_id=$1`,
      [track.trackId],
    );
    const nextRevisionId = randomUUID();
    await pool.query(
      `INSERT INTO workflow.submission_revision
       (id,submission_id,revision_number,created_by_user_id,revision_status,producer_metadata,submitted_at)
       VALUES ($1,$2,2,$3,'accepted','{}'::jsonb,now())`,
      [nextRevisionId, submission.rows[0]!.id, producerOne.id],
    );
    await pool.query(
      `UPDATE workflow.submission SET current_revision_id=$2,latest_revision_number=2 WHERE id=$1`,
      [submission.rows[0]!.id, nextRevisionId],
    );
    await pool.query(
      `UPDATE catalog.track SET published_revision_id=$2 WHERE id=$1`,
      [track.trackId, nextRevisionId],
    );
    await expect(
      acceptResponse(pool, coordinator, {
        demandId,
        responseId: response.id,
        rowVersion: response.rowVersion,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await submitOrRefreshResponse(pool, producerOne, {
      demandId,
      responseId: response.id,
      rowVersion: response.rowVersion,
    });
    response = (await getDemandDetail(pool, demandId, coordinator))!
      .responses[0]!;
    await acceptResponse(pool, coordinator, {
      demandId,
      responseId: response.id,
      rowVersion: response.rowVersion,
    });
    expect(
      (await getDemandDetail(pool, demandId, coordinator))!.responses[0]
        ?.status,
    ).toBe("accepted");
  });

  it("serializes simultaneous acceptance and withdrawal of one response", async () => {
    const demandId = await createDemand(pool, coordinator, demandInput());
    const track = await publishedTrack(
      producerOne,
      "Concurrent decision theme",
    );
    await proposeCatalogTrack(pool, producerOne, {
      demandId,
      trackId: track.trackId,
    });
    const response = (await getDemandDetail(pool, demandId, coordinator))!
      .responses[0]!;
    const results = await Promise.allSettled([
      acceptResponse(pool, coordinator, {
        demandId,
        responseId: response.id,
        rowVersion: response.rowVersion,
      }),
      withdrawResponse(pool, producerOne, {
        demandId,
        responseId: response.id,
        rowVersion: response.rowVersion,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      ["accepted", "withdrawn"].includes(
        (await getDemandDetail(pool, demandId, coordinator))!.responses[0]!
          .status,
      ),
    ).toBe(true);
  });

  it("blocks proposals after the response deadline", async () => {
    const demandId = await createDemand(pool, coordinator, demandInput());
    const track = await publishedTrack(producerOne, "Late response theme");
    await pool.query(
      `UPDATE planning.demand SET response_deadline_on=CURRENT_DATE-1,needed_by_on=CURRENT_DATE WHERE id=$1`,
      [demandId],
    );
    await expect(
      proposeCatalogTrack(pool, producerOne, {
        demandId,
        trackId: track.trackId,
      }),
    ).rejects.toBeInstanceOf(DemandRepositoryError);
  });

  it("enforces response subjects, uniqueness and append-only events in PostgreSQL", async () => {
    const demandId = await createDemand(pool, coordinator, demandInput());
    const first = await publishedTrack(producerOne, "Trigger source theme");
    const second = await publishedTrack(producerOne, "Different theme");
    const submission = await pool.query<{ id: string }>(
      `SELECT id FROM workflow.submission WHERE track_id=$1`,
      [first.trackId],
    );
    await expect(
      pool.query(
        `INSERT INTO planning.demand_response
         (id,demand_id,track_id,submission_id,origin,status,responder_user_id,brief_version_started)
         VALUES ($1,$2,$3,$4,'submission','working',$5,1)`,
        [
          randomUUID(),
          demandId,
          second.trackId,
          submission.rows[0]!.id,
          producerOne.id,
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await proposeCatalogTrack(pool, producerOne, {
      demandId,
      trackId: first.trackId,
    });
    await expect(
      proposeCatalogTrack(pool, producerTwo, {
        demandId,
        trackId: first.trackId,
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
    const event = await pool.query<{ id: string }>(
      `SELECT id FROM planning.demand_event WHERE demand_id=$1 LIMIT 1`,
      [demandId],
    );
    await expect(
      pool.query(
        `UPDATE planning.demand_event SET event_type='demand_updated' WHERE id=$1`,
        [event.rows[0]!.id],
      ),
    ).rejects.toMatchObject({ code: "55000" });
  });
});
