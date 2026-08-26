import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const mediaFixture = {
  trackId: randomUUID(),
  submissionId: randomUUID(),
  revisionId: randomUUID(),
  masterAssetId: randomUUID(),
  stemAssetId: randomUUID(),
  masterSourceId: randomUUID(),
  stemSourceId: randomUUID(),
  masterPreviewId: randomUUID(),
  stemPreviewId: randomUUID(),
};
let fixturePool: Pool;

function sha256(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

test.beforeAll(async () => {
  fixturePool = new Pool({ connectionString: process.env.DATABASE_URL });
  const creator = await fixturePool.query<{ id: string }>(
    `SELECT id FROM auth."user" WHERE role='admin' ORDER BY "createdAt" LIMIT 1`,
  );
  const creatorId = creator.rows[0]?.id;
  if (!creatorId) throw new Error("Seeded Admin is required for Library E2E");
  await fixturePool.query(
    `INSERT INTO catalog.track
       (id,title,version_label,created_by_user_id)
     VALUES ($1,'Published Media E2E','Broadcast master',$2)`,
    [mediaFixture.trackId, creatorId],
  );
  await fixturePool.query(
    `INSERT INTO workflow.submission
       (id,track_id,owner_user_id,status,current_revision_id,latest_revision_number)
     VALUES ($1,$2,$3,'approved',NULL,0)`,
    [mediaFixture.submissionId, mediaFixture.trackId, creatorId],
  );
  await fixturePool.query(
    `INSERT INTO workflow.submission_revision
       (id,submission_id,revision_number,created_by_user_id,
        revision_status,submitted_at)
     VALUES ($1,$2,1,$3,'accepted',now())`,
    [mediaFixture.revisionId, mediaFixture.submissionId, creatorId],
  );
  await fixturePool.query(
    "UPDATE workflow.submission SET current_revision_id=$2,latest_revision_number=1 WHERE id=$1",
    [mediaFixture.submissionId, mediaFixture.revisionId],
  );
  await fixturePool.query(
    `INSERT INTO catalog.track_metadata (track_id,vocal_state)
     VALUES ($1,'instrumental')`,
    [mediaFixture.trackId],
  );
  await fixturePool.query(
    `INSERT INTO catalog.audio_asset
       (id,track_id,submission_revision_id,asset_role,stem_type,stem_label,sort_order)
     VALUES ($1,$3,$4,'master',NULL,NULL,0),
            ($2,$3,$4,'stem','drums','E2E Drums',1)`,
    [
      mediaFixture.masterAssetId,
      mediaFixture.stemAssetId,
      mediaFixture.trackId,
      mediaFixture.revisionId,
    ],
  );
  const storageRoot = path.resolve(
    process.env.LOCAL_STORAGE_ROOT ?? ".soundvault-storage",
  );
  const sourceRoot = path.join(
    storageRoot,
    "submissions",
    mediaFixture.submissionId,
    "revisions",
    "1",
  );
  const previewRoot = path.join(storageRoot, "generated", "previews");
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(previewRoot, { recursive: true });
  const files = [
    {
      assetId: mediaFixture.masterAssetId,
      sourceId: mediaFixture.masterSourceId,
      previewId: mediaFixture.masterPreviewId,
      frequency: "440",
    },
    {
      assetId: mediaFixture.stemAssetId,
      sourceId: mediaFixture.stemSourceId,
      previewId: mediaFixture.stemPreviewId,
      frequency: "220",
    },
  ];
  for (const file of files) {
    const sourcePath = path.join(sourceRoot, `${file.sourceId}.wav`);
    const previewPath = path.join(previewRoot, `${file.assetId}.mp3`);
    execFileSync("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${file.frequency}:sample_rate=48000`,
      "-t",
      "1",
      "-c:a",
      "pcm_s16le",
      "-y",
      sourcePath,
    ]);
    execFileSync("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      sourcePath,
      "-map_metadata",
      "-1",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-y",
      previewPath,
    ]);
    await fixturePool.query(
      `INSERT INTO catalog.audio_file
         (id,audio_asset_id,file_role,original_filename,storage_backend,
          storage_key,content_type,container_format,codec,byte_size,
          checksum_sha256,duration_ms,sample_rate_hz,channels,technical_status)
       VALUES ($1,$2,'source',$3,'local',$4,'audio/wav','wav','pcm_s16le',
               $5,$6,1000,48000,1,'available'),
              ($7,$2,'preview',$8,'local',$9,'audio/mpeg','mp3','mp3',
               $10,$11,1000,48000,1,'available')`,
      [
        file.sourceId,
        file.assetId,
        file.assetId === mediaFixture.masterAssetId
          ? "Published Media E2E Master.wav"
          : "Published Media E2E Drums.wav",
        `submissions/${mediaFixture.submissionId}/revisions/1/${file.sourceId}.wav`,
        statSync(sourcePath).size,
        sha256(sourcePath),
        file.previewId,
        `soundvault-preview-${file.assetId}.mp3`,
        `generated/previews/${file.assetId}.mp3`,
        statSync(previewPath).size,
        sha256(previewPath),
      ],
    );
    await fixturePool.query(
      `INSERT INTO media.playback_artifact
         (id,track_id,submission_revision_id,audio_asset_id,
          source_audio_file_id,preview_audio_file_id,status,profile_version,
          waveform_peaks,waveform_peak_count,ready_at)
       VALUES ($1,$2,$3,$4,$5,$6,'ready',1,
          ARRAY[-12000,12000,-16000,16000]::smallint[],2,now())`,
      [
        randomUUID(),
        mediaFixture.trackId,
        mediaFixture.revisionId,
        file.assetId,
        file.sourceId,
        file.previewId,
      ],
    );
  }
  await fixturePool.query(
    `UPDATE catalog.track
     SET publication_status='published',published_revision_id=$2,
         published_by_user_id=$3,published_at=now()
     WHERE id=$1`,
    [mediaFixture.trackId, mediaFixture.revisionId, creatorId],
  );
});

test.afterAll(async () => {
  await fixturePool.end();
});

async function enterLibrary(page: Page, accessName: string) {
  await page.goto("/sign-in?callbackUrl=%2Flibrary");
  await page
    .getByRole("button", { name: `Enter as ${accessName}`, exact: true })
    .click();
  await expect(page).toHaveURL(/\/library$/);
}

test("all four roles can reach the published library", async ({ browser }) => {
  for (const role of ["Admin", "Music Producer", "Coordinator", "User"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await enterLibrary(page, role);
    await expect(
      page.getByRole("heading", { name: "Published Library" }),
    ).toBeVisible();
    await context.close();
  }
});

test("library search is keyboard accessible and rejects exclusion-only queries", async ({
  page,
}) => {
  await enterLibrary(page, "User");
  const search = page.getByRole("searchbox", {
    name: "Search published library",
  });
  await search.fill("-sports -promo");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Add a word to search for." }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    ),
  ).toEqual([]);
});

test("mobile filters open as a labelled sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterLibrary(page, "User");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Filter library" }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Track type" })).toBeVisible();
});

test("player persists across Library navigation, switches to a Stem, streams ranges and denies withdrawal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await enterLibrary(page, "User");
  const card = page
    .getByRole("article")
    .filter({ hasText: "Published Media E2E" });
  await card.getByRole("button", { name: "Play Published Media E2E" }).click();
  const player = page.getByRole("region", { name: "SoundVault player" });
  await expect(player).toContainText("Published Media E2E · Master");
  await expect
    .poll(() =>
      page.locator("audio").evaluate((audio: HTMLAudioElement) => ({
        currentSrc: audio.currentSrc,
        readyState: audio.readyState,
        error: audio.error?.code ?? null,
      })),
    )
    .toMatchObject({
      currentSrc: expect.stringContaining(
        `/api/library/tracks/${mediaFixture.trackId}/audio/`,
      ),
      readyState: expect.any(Number),
      error: null,
    });
  await card.getByRole("link", { name: "Published Media E2E" }).click();
  await expect(page).toHaveURL(new RegExp(`/library/${mediaFixture.trackId}$`));
  await expect(player).toContainText("Published Media E2E · Master");
  const stemRow = page.getByRole("listitem").filter({ hasText: "E2E Drums" });
  await stemRow.getByRole("button", { name: "Play" }).click();
  await expect(player).toContainText("Published Media E2E · E2E Drums");
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(player).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await player.getByRole("button", { name: "Show queue" }).click();
  await expect(
    player.getByRole("region", { name: "Player queue" }),
  ).toBeVisible();
  const sourceResponse = await page.request.get(
    `/api/library/tracks/${mediaFixture.trackId}/downloads/${mediaFixture.masterAssetId}`,
    { headers: { Range: "bytes=0-31" } },
  );
  expect(sourceResponse.status()).toBe(206);
  expect(sourceResponse.headers()["content-range"]).toContain("bytes 0-31/");
  expect(sourceResponse.headers()["content-disposition"]).toContain(
    "attachment",
  );
  await fixturePool.query(
    "UPDATE catalog.track SET publication_status='withdrawn',withdrawn_at=now() WHERE id=$1",
    [mediaFixture.trackId],
  );
  const denied = await page.request.get(
    `/api/library/tracks/${mediaFixture.trackId}/playback`,
  );
  expect(denied.status()).toBe(404);
  await fixturePool.query(
    `UPDATE catalog.track
     SET publication_status='published',withdrawn_at=NULL WHERE id=$1`,
    [mediaFixture.trackId],
  );
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(
    accessibility.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    ),
  ).toEqual([]);
});
