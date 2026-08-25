import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

const identities = {
  admin: {
    email: process.env.LOCAL_ADMIN_EMAIL ?? "",
    accessName: "Admin",
  },
  producer: {
    email: process.env.LOCAL_PRODUCER_EMAIL ?? "",
    accessName: "Music Producer",
  },
  coordinator: {
    email: process.env.LOCAL_COORDINATOR_EMAIL ?? "",
    accessName: "Coordinator",
  },
};

async function signIn(
  page: Page,
  identity: { email: string; accessName: string },
  expectedPath: string,
) {
  expect(identity.email).not.toBe("");
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(expectedPath)}`);
  await page
    .getByRole("button", {
      name: `Enter as ${identity.accessName}`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`${expectedPath.replace("/", "\\/")}$`),
  );
  await page.waitForLoadState("networkidle");
}

async function roleUserId(email: string) {
  const result = await pool!.query<{ id: string }>(
    `SELECT id FROM auth."user" WHERE lower(email)=lower($1)`,
    [email],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`Seeded local identity not found for ${email}`);
  return id;
}

async function readyReview(ownerId: string, reviewerId: string, title: string) {
  const trackId = randomUUID();
  const submissionId = randomUUID();
  const revisionId = randomUUID();
  const reviewCaseId = randomUUID();
  await pool!.query(
    `INSERT INTO catalog.taxonomy_term (id,category,slug,label) VALUES
       ('70000000-0000-4000-8000-000000000001','format','background-bed','Background Bed'),
       ('70000000-0000-4000-8000-000000000102','use_case','general-news','General News')
     ON CONFLICT (category,slug) DO NOTHING`,
  );
  await pool!.query(
    `INSERT INTO catalog.track (id,asset_kind,title,created_by_user_id)
     VALUES ($1,'music',$2,$3)`,
    [trackId, title, ownerId],
  );
  await pool!.query(
    `INSERT INTO workflow.submission
       (id,track_id,owner_user_id,status,current_revision_id,latest_revision_number)
     VALUES ($1,$2,$3,'in_review',NULL,0)`,
    [submissionId, trackId, ownerId],
  );
  await pool!.query(
    `INSERT INTO workflow.submission_revision
       (id,submission_id,revision_number,created_by_user_id,revision_status,
        producer_metadata,submitted_at)
     VALUES ($1,$2,1,$3,'submitted',$4,now())`,
    [revisionId, submissionId, ownerId, { workingTitle: title }],
  );
  await pool!.query(
    `UPDATE workflow.submission SET current_revision_id=$2,latest_revision_number=1
     WHERE id=$1`,
    [submissionId, revisionId],
  );
  await pool!.query(
    `INSERT INTO rights.rights_declaration
       (id,submission_revision_id,master_rights_basis,composition_rights_basis,
        content_id_eligibility,declared_by_user_id)
     VALUES ($1,$2,'owned','owned','unknown',$3)`,
    [randomUUID(), revisionId, ownerId],
  );
  await pool!.query(
    `INSERT INTO rights.copyright_check
       (id,submission_revision_id,track_id,status,outcome,created_by_user_id)
     VALUES ($1,$2,$3,'completed','no_claim_observed',$4)`,
    [randomUUID(), revisionId, trackId, reviewerId],
  );
  await pool!.query(
    `INSERT INTO workflow.review_case
       (id,submission_id,submission_revision_id,track_id,status,
        assigned_to_user_id,started_by_user_id,started_at,ready_for_decision_at)
     VALUES ($1,$2,$3,$4,'ready_for_decision',$5,$5,now(),now())`,
    [reviewCaseId, submissionId, revisionId, trackId, reviewerId],
  );
  const reviewedAt = new Date().toISOString();
  const decision = (value: string) => ({
    value,
    sourceKind: "coordinator",
    sourceReference: null,
    reviewed: true,
    reviewedByUserId: reviewerId,
    reviewedAt,
  });
  await pool!.query(
    `INSERT INTO workflow.review_metadata_draft (review_case_id,fields)
     VALUES ($1,$2)`,
    [
      reviewCaseId,
      {
        title: decision(title),
        description: decision("Section 8 browser fixture"),
        vocalState: decision("instrumental"),
        format: decision("background_bed"),
        underDialogue: decision("yes"),
        loopable: decision("no"),
        endingType: decision("clean_stop"),
      },
    ],
  );
  const terms = await pool!.query<{ id: string }>(
    `SELECT id FROM catalog.taxonomy_term
     WHERE (category='format' AND slug='background-bed')
        OR (category='use_case' AND slug='general-news')
     ORDER BY category`,
  );
  for (const term of terms.rows) {
    await pool!.query(
      `INSERT INTO workflow.review_term_selection
         (id,review_case_id,term_id,source_kind,decision,decided_by_user_id)
       VALUES ($1,$2,$3,'coordinator','selected',$4)`,
      [randomUUID(), reviewCaseId, term.id, reviewerId],
    );
  }
  for (const code of [
    "master_audio",
    "stems",
    "technical_qc",
    "metadata_core",
    "metadata_editorial",
    "rights",
    "copyright",
  ]) {
    await pool!.query(
      `INSERT INTO workflow.review_check_item
         (id,review_case_id,code,status,reviewed_by_user_id,reviewed_at)
       VALUES ($1,$2,$3,$4,$5,now())`,
      [
        randomUUID(),
        reviewCaseId,
        code,
        code === "stems" ? "not_applicable" : "pass",
        reviewerId,
      ],
    );
  }
  return { submissionId, title };
}

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

let approval: { submissionId: string; title: string };
let changes: { submissionId: string; title: string };
let rejection: { submissionId: string; title: string };

test.beforeAll(async () => {
  if (!pool) throw new Error("DATABASE_URL is required for Section 8 E2E");
  const producerId = await roleUserId(identities.producer.email);
  const coordinatorId = await roleUserId(identities.coordinator.email);
  approval = await readyReview(
    producerId,
    coordinatorId,
    `Section 8 Publish ${randomUUID().slice(0, 8)}`,
  );
  changes = await readyReview(
    producerId,
    coordinatorId,
    `Section 8 Changes ${randomUUID().slice(0, 8)}`,
  );
  rejection = await readyReview(
    producerId,
    coordinatorId,
    `Section 8 Reject ${randomUUID().slice(0, 8)}`,
  );
});

test.afterAll(async () => {
  await pool?.end();
});

test("decision panel is accessible, responsive and publishes separately", async ({
  page,
}) => {
  await signIn(
    page,
    identities.coordinator,
    `/review/${approval.submissionId}`,
  );
  await expect(
    page.getByRole("heading", { name: "Decision panel" }),
  ).toBeVisible();
  for (const name of ["Approve", "Request Changes", "Recommend Rejection"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Decision panel" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    accessibility.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    ),
  ).toEqual([]);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1";
  });
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/submissions/${approval.submissionId}$`),
  );
  await expect(page.getByText("Approved — awaiting publication")).toBeVisible();
  await page.getByRole("button", { name: "Publish to Library" }).click();
  await expect(page.getByText("Published to Library")).toBeVisible();
  await page.goto("/library");
  await expect(page.getByText(approval.title, { exact: true })).toBeVisible();
});

test("Producer receives structured changes and a Revision N+1 handoff", async ({
  browser,
}) => {
  const coordinatorContext = await browser.newContext();
  const coordinatorPage = await coordinatorContext.newPage();
  await signIn(
    coordinatorPage,
    identities.coordinator,
    `/review/${changes.submissionId}`,
  );
  await coordinatorPage
    .getByLabel("Summary for Producer")
    .fill("Please replace the clipped Master and resubmit.");
  await coordinatorPage
    .getByLabel("Required change")
    .fill("Upload a clean full-length Master.");
  await coordinatorPage
    .getByRole("button", { name: "Request Changes", exact: true })
    .click();
  await expect(coordinatorPage).toHaveURL(
    new RegExp(`/submissions/${changes.submissionId}$`),
  );
  await coordinatorContext.close();

  const producerContext = await browser.newContext();
  const producerPage = await producerContext.newPage();
  await signIn(
    producerPage,
    identities.producer,
    `/submissions/${changes.submissionId}`,
  );
  await expect(
    producerPage.getByRole("heading", { name: "Changes requested" }),
  ).toBeVisible();
  await expect(
    producerPage.getByText("Upload a clean full-length Master."),
  ).toBeVisible();
  await producerPage.getByRole("link", { name: "Revise Submission" }).click();
  await expect(
    producerPage.getByRole("heading", { name: "Revise submission" }),
  ).toBeVisible();
  await expect(producerPage.getByText("Preparing Revision 2")).toBeVisible();
  await producerContext.close();
});

test("Coordinator recommends rejection and only Admin confirms it", async ({
  browser,
}) => {
  const coordinatorContext = await browser.newContext();
  const coordinatorPage = await coordinatorContext.newPage();
  await signIn(
    coordinatorPage,
    identities.coordinator,
    `/review/${rejection.submissionId}`,
  );
  await coordinatorPage
    .getByLabel("Internal reason")
    .fill("The supplied ownership evidence conflicts with the declaration.");
  await coordinatorPage
    .getByRole("button", { name: "Recommend Rejection", exact: true })
    .click();
  await expect(coordinatorPage.getByText("Decision pending")).toBeVisible();
  await expect(
    coordinatorPage.getByRole("button", { name: "Confirm Rejection" }),
  ).toHaveCount(0);
  await coordinatorContext.close();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(
    adminPage,
    identities.admin,
    `/submissions/${rejection.submissionId}`,
  );
  await adminPage
    .getByLabel("Final reason for Producer")
    .fill("Ownership could not be verified from the supplied evidence.");
  await adminPage.getByRole("button", { name: "Confirm Rejection" }).click();
  await expect(adminPage.getByText("Rejected", { exact: true })).toBeVisible();
  await adminContext.close();
});
