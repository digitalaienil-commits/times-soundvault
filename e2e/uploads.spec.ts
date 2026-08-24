import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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
  user: {
    email: process.env.LOCAL_USER_EMAIL ?? "",
    accessName: "User",
  },
};

function wav(): Buffer {
  const dataBytes = 16_000;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
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
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

function mp3(): Buffer {
  const buffer = Buffer.alloc(256);
  buffer.write("ID3", 0);
  buffer[3] = 3;
  buffer[10] = 0xff;
  buffer[11] = 0xfb;
  buffer[12] = 0x90;
  buffer[13] = 0x64;
  return buffer;
}

const wavFile = (name: string) => ({
  name,
  mimeType: "audio/wav",
  buffer: wav(),
});
const mp3File = (name: string) => ({
  name,
  mimeType: "audio/mpeg",
  buffer: mp3(),
});

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
}

async function goToReview(page: Page) {
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Review & Upload" }),
  ).toBeVisible();
}

async function selectFiles(
  page: Page,
  files: Parameters<ReturnType<Page["locator"]>["setInputFiles"]>[0],
) {
  await expect(
    page.getByRole("heading", { name: "Upload music", level: 1 }),
  ).toBeVisible();
  const input = page.locator("#soundvault-files");
  await expect(input).toBeAttached();
  await input.setInputFiles(files);
}

let producerDraftBatchId = "";
let producerDraftSubmissionId = "";
let coordinatorSubmissionId = "";

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

test("User cannot reach static or dynamic upload workspaces", async ({
  page,
}) => {
  await signIn(page, identities.user, "/library");
  await expect(
    page.getByRole("link", { name: "Upload", exact: true }),
  ).toHaveCount(0);
  for (const path of [
    "/upload",
    "/upload/550e8400-e29b-41d4-a716-446655440000",
    "/submissions/550e8400-e29b-41d4-a716-446655440000",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/access-denied$/);
  }
});

test("Music Producer saves, reloads, resumes and submits a metadata-light WAV", async ({
  page,
}) => {
  await signIn(page, identities.producer, "/upload");
  const file = wavFile("Field_Note.wav");
  await selectFiles(page, file);
  await expect(page.getByText("Accepted for verification")).toBeVisible();
  await goToReview(page);
  await expect(page.getByText("Field Note", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Draft batch saved")).toBeVisible();
  await page.getByRole("link", { name: "Open saved batch" }).click();
  await expect(page).toHaveURL(/\/upload\/[0-9a-f-]+$/);
  producerDraftBatchId = page.url().split("/").at(-1) ?? "";

  await page.reload();
  await page
    .getByLabel("Reselect files for resumable upload")
    .setInputFiles(file);
  await expect(
    page.getByText(
      "1 of 1 unfinished files matched by original name and exact size.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume matched files" }).click();
  await expect(page.getByText(/Selected uploads completed/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("All registered files have been received."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Field Note", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Producer metadata" }),
  ).toBeVisible();
  await page.getByText(/I confirm that I am authorised/).click();
  await page.getByRole("button", { name: "Submit for Processing" }).click();
  await expect(page.getByText("Submitted for Processing.")).toBeVisible();
  await page.goto("/my-uploads");
  await expect(
    page
      .locator('section[aria-labelledby="upload-results"]')
      .getByRole("listitem")
      .filter({ hasText: "Field Note" })
      .first(),
  ).toBeVisible();
});

test("Producer creates a resumable private draft for cross-role boundary checks", async ({
  page,
}) => {
  await signIn(page, identities.producer, "/upload");
  await selectFiles(page, wavFile("Private_Draft.wav"));
  await goToReview(page);
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Draft batch saved")).toBeVisible();
  await page.getByRole("link", { name: "Open saved batch" }).click();
  await expect(page).toHaveURL(/\/upload\/[0-9a-f-]+$/);
  producerDraftBatchId = page.url().split("/").at(-1) ?? "";
  await page.getByRole("link", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9a-f-]+$/);
  producerDraftSubmissionId = page.url().split("/").at(-1) ?? "";
});

test("Coordinator corrects grouping, survives partial failure, retries, and submits bulk audio", async ({
  page,
}) => {
  await signIn(page, identities.coordinator, "/upload");
  await selectFiles(page, [
    mp3File("NewsBed_MASTER.mp3"),
    wavFile("NewsBed_DRUMS.wav"),
    wavFile("Alert_MASTER.wav"),
    wavFile("mystery.wav"),
  ]);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const ambiguous = page
    .getByRole("listitem")
    .filter({ hasText: "mystery.wav" });
  await expect(ambiguous.getByLabel("File role")).toHaveValue("unassigned");
  await ambiguous.getByLabel("Track").selectOption({ label: "Newsbed" });
  await ambiguous.getByLabel("File role").selectOption("stem");
  await ambiguous.getByLabel("Stem type").selectOption("fx");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const summary = page.getByRole("complementary", { name: "Batch summary" });
  await expect(summary.getByText("Tracks")).toBeVisible();
  await expect(summary.getByText("2", { exact: true })).toBeVisible();
  await page.getByText(/I confirm that I am authorised/).click();

  let failingSessionPath = "";
  let failedAttempts = 0;
  await page.route("**/api/uploads/*/chunk", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!failingSessionPath) failingSessionPath = path;
    if (path === failingSessionPath && failedAttempts < 4) {
      failedAttempts += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic transient failure" }),
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Start Upload" }).click();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByText("Files received").first()).toBeVisible();
  await page.unroute("**/api/uploads/*/chunk");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.getByText("Files received")).toHaveCount(4);

  const submitButtons = page.getByRole("button", { name: /for Processing$/ });
  await expect(submitButtons).toHaveCount(2);
  for (const label of await submitButtons.allTextContents()) {
    const button = page.getByRole("button", { name: label, exact: true });
    await button.click();
    await expect(button).toHaveCount(0);
  }
  await page.goto("/my-uploads");
  const newsbed = page
    .locator('section[aria-labelledby="upload-results"]')
    .getByRole("listitem")
    .filter({ hasText: "Newsbed" })
    .first();
  await newsbed.getByRole("link", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9a-f-]+$/);
  coordinatorSubmissionId = page.url().split("/").at(-1) ?? "";
});

test("Coordinator can read all but cannot mutate another owner's draft", async ({
  page,
}) => {
  await signIn(page, identities.coordinator, "/dashboard");
  await page.goto(`/submissions/${producerDraftSubmissionId}`);
  await expect(
    page.getByRole("heading", { name: "Private Draft", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Draft actions" }),
  ).toHaveCount(0);
  const status = await page.evaluate(async (submissionId) => {
    const response = await fetch(`/api/submissions/${submissionId}/metadata`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingTitle: "Not allowed" }),
    });
    return response.status;
  }, producerDraftSubmissionId);
  expect(status).toBe(403);
});

test("Producer cannot read another owner's draft", async ({ page }) => {
  await signIn(page, identities.producer, "/dashboard");
  const response = await page.request.get(
    `/submissions/${coordinatorSubmissionId}`,
  );
  expect(response.status()).toBe(404);
});

test("Admin can inspect and resume another owner's draft and upload a WAV", async ({
  page,
}) => {
  await signIn(page, identities.admin, "/dashboard");
  await page.goto(`/upload/${producerDraftBatchId}`);
  await expect(
    page.getByRole("heading", { name: "Resume upload", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Private_Draft.wav")).toBeVisible();

  await page.goto("/upload");
  await selectFiles(page, wavFile("Admin_Theme.wav"));
  await goToReview(page);
  await page.getByText(/I confirm that I am authorised/).click();
  await page.getByRole("button", { name: "Start Upload" }).click();
  await expect(page.getByText("Files received")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /for Processing$/ }),
  ).toBeEnabled();
});

test("Validation, keyboard fallback, responsive layout and accessibility stay usable", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await signIn(page, identities.producer, "/upload");
  await page.getByRole("button", { name: "Choose files" }).focus();
  await expect(
    page.getByRole("button", { name: "Choose files" }),
  ).toBeFocused();
  await selectFiles(page, {
    name: "malware.exe.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await expect(
    page.getByText("Double-extension files are not accepted"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Upload", level: 1 }),
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
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    ),
  ).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
