import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : null;
const submissionId = randomUUID();
const revisionId = randomUUID();
const trackId = randomUUID();
const assetId = randomUUID();
const audioFileId = randomUUID();
const storageKey = `submissions/${submissionId}/revisions/1/${audioFileId}.wav`;
const reviewTitle = `Section Seven Review Bed ${submissionId.slice(0, 8)}`;

const identities = {
  admin: { email: process.env.LOCAL_ADMIN_EMAIL ?? "", accessName: "Admin" },
  producer: {
    email: process.env.LOCAL_PRODUCER_EMAIL ?? "",
    accessName: "Music Producer",
  },
  coordinator: {
    email: process.env.LOCAL_COORDINATOR_EMAIL ?? "",
    accessName: "Coordinator",
  },
  user: { email: process.env.LOCAL_USER_EMAIL ?? "", accessName: "User" },
};

async function signIn(
  page: Page,
  identity: (typeof identities)[keyof typeof identities],
  path: string,
) {
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(path)}`);
  await page
    .getByRole("button", {
      name: `Enter as ${identity.accessName}`,
      exact: true,
    })
    .click();
}

function wav() {
  const buffer = Buffer.alloc(48);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(40, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(4, 40);
  return buffer;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (!database)
    throw new Error("DATABASE_URL is required for review E2E tests");
  const owner = await database.query<{ id: string }>(
    `SELECT id FROM auth."user" WHERE lower(email)=lower($1)`,
    [identities.producer.email],
  );
  const ownerId = owner.rows[0]?.id;
  if (!ownerId) throw new Error("Seeded producer identity is unavailable");
  await database.query("BEGIN");
  try {
    await database.query(
      `INSERT INTO catalog.track (id,title,asset_kind,created_by_user_id) VALUES ($1,$2,'music',$3)`,
      [trackId, reviewTitle, ownerId],
    );
    await database.query(
      `INSERT INTO workflow.submission
       (id,track_id,owner_user_id,status,latest_revision_number,review_started_at)
       VALUES ($1,$2,$3,'ready_for_review',0,NULL)`,
      [submissionId, trackId, ownerId],
    );
    await database.query(
      `INSERT INTO workflow.submission_revision
       (id,submission_id,revision_number,created_by_user_id,revision_status,producer_metadata,submitted_at)
       VALUES ($1,$2,1,$3,'submitted',$4,now())`,
      [
        revisionId,
        submissionId,
        ownerId,
        {
          workingTitle: reviewTitle,
          format: "background_bed",
          editorialUses: ["breaking_news"],
          vocalState: "instrumental",
        },
      ],
    );
    await database.query(
      `UPDATE workflow.submission SET current_revision_id=$2, latest_revision_number=1 WHERE id=$1`,
      [submissionId, revisionId],
    );
    await database.query(
      `INSERT INTO catalog.audio_asset (id,track_id,submission_revision_id,asset_role,display_title)
       VALUES ($1,$2,$3,'master','Master')`,
      [assetId, trackId, revisionId],
    );
    await database.query(
      `INSERT INTO catalog.audio_file
       (id,audio_asset_id,file_role,original_filename,storage_backend,storage_key,content_type,container_format,byte_size,technical_status)
       VALUES ($1,$2,'source','review.wav','local',$3,'audio/wav','wav',48,'available')`,
      [audioFileId, assetId, storageKey],
    );
    await database.query(
      `INSERT INTO analysis.revision_analysis
       (id,submission_revision_id,track_id,technical_status,cyanite_status,overall_status,technical_completed_at,completed_at)
       VALUES ($1,$2,$3,'complete','disabled','complete',now(),now())`,
      [randomUUID(), revisionId, trackId],
    );
    await database.query(
      `INSERT INTO rights.rights_declaration
       (id,submission_revision_id,master_rights_basis,composition_rights_basis,content_id_eligibility,declared_by_user_id)
       VALUES ($1,$2,'owned','owned','eligible',$3)`,
      [randomUUID(), revisionId, ownerId],
    );
    await database.query(
      `INSERT INTO catalog.taxonomy_term (id,category,slug,label) VALUES
       ($1,'format','background-bed','Background Bed'),
       ($2,'use_case','breaking-news','Breaking News')
       ON CONFLICT (category,slug) DO NOTHING`,
      [randomUUID(), randomUUID()],
    );
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
  const root = path.resolve(
    process.env.LOCAL_STORAGE_ROOT ?? ".soundvault-storage",
  );
  const filePath = path.join(root, storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, wav());
});

test.afterAll(async () => {
  await database?.end();
});

test("Producer and User cannot access Section 7 routes or review audio", async ({
  browser,
}) => {
  for (const identity of [identities.producer, identities.user]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, identity, "/review");
    await expect(page).toHaveURL(/\/access-denied$/);
    const response = await context.request.get(
      `/api/review/audio/${audioFileId}`,
      {
        headers: { Range: "bytes=0-3" },
      },
    );
    expect([403, 404]).toContain(response.status());
    await context.close();
  }
});

test("Coordinator claims a review and securely seeks the Master audio", async ({
  page,
}) => {
  await signIn(page, identities.coordinator, "/review");
  const row = page.getByRole("listitem").filter({ hasText: reviewTitle });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Start review" }).click();
  await expect(page).toHaveURL(new RegExp(`/review/${submissionId}$`));
  await expect(
    page.getByRole("heading", { name: reviewTitle, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Audio review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /approve|reject|publish|request changes/i,
    }),
  ).toHaveCount(0);

  const response = await page.request.get(`/api/review/audio/${audioFileId}`, {
    headers: { Range: "bytes=8-11" },
  });
  expect(response.status()).toBe(206);
  expect(response.headers()["content-range"]).toBe("bytes 8-11/48");
  expect(response.headers()["cache-control"]).toContain("private, no-store");
  expect((await response.body()).toString()).toBe("WAVE");

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    accessibility.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    ),
  ).toEqual([]);
});

test("Admin can reassign and the Coordinator then sees a read-only review", async ({
  browser,
}) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, identities.admin, `/review/${submissionId}`);
  await expect(
    adminPage.getByRole("heading", { name: "Assignment" }),
  ).toBeVisible();
  const adminOption = await adminPage
    .getByLabel("Select reviewer")
    .locator("option", { hasText: "admin" })
    .first()
    .getAttribute("value");
  await adminPage.getByLabel("Select reviewer").selectOption(adminOption!);
  await adminPage.getByRole("button", { name: "Reassign" }).click();
  await expect(adminPage.getByText("Saved", { exact: true })).toBeVisible();

  const coordinatorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const coordinatorPage = await coordinatorContext.newPage();
  await signIn(
    coordinatorPage,
    identities.coordinator,
    `/review/${submissionId}`,
  );
  await expect(
    coordinatorPage.getByText(/You can inspect it read-only/),
  ).toBeVisible();
  await expect(
    coordinatorPage.getByRole("button", { name: "Save field" }),
  ).toHaveCount(0);
  await expect(
    coordinatorPage.getByRole("heading", { name: "Review progress" }),
  ).toBeVisible();
  await adminContext.close();
  await coordinatorContext.close();
});
