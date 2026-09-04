import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

let pool: Pool;

test.beforeAll(() => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
});

test.afterAll(async () => {
  await pool.end();
});

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  music_producer: "Music Producer",
  coordinator: "Coordinator",
  user: "User",
};

async function signInAs(
  page: Page,
  role: "admin" | "music_producer" | "coordinator" | "user",
  destination?: string,
) {
  await page.context().clearCookies();
  const label = ROLE_LABELS[role] ?? role;
  const callback = destination ?? (role === "user" ? "/library" : "/dashboard");
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(callback)}`);
  const button = page.getByRole("button", {
    name: `Enter as ${label}`,
    exact: true,
  });
  await button.click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.waitForLoadState("networkidle");
}

test.describe("Section 13 Similarity Search and AI Music Generation", () => {
  test("enforces role route boundaries for /generate", async ({ page }) => {
    // 1. User should NOT have access to /generate
    await signInAs(page, "user");
    await page.goto("/generate");
    await expect(page).toHaveURL(/\/access-denied$/);

    // 2. Music Producer should have access to /generate
    await signInAs(page, "music_producer", "/generate");
    await expect(page).toHaveURL(/\/generate$/);
    await expect(
      page.getByRole("heading", { name: "AI Music Generation" }),
    ).toBeVisible();

    // 3. Coordinator should have access to /generate
    await signInAs(page, "coordinator", "/generate");
    await expect(page).toHaveURL(/\/generate$/);

    // 4. Admin should have access to /generate
    await signInAs(page, "admin", "/generate");
    await expect(page).toHaveURL(/\/generate$/);
  });

  test("generates simulated audio in dry-run mode and commits draft submission", async ({
    page,
  }) => {
    await signInAs(page, "music_producer", "/generate");

    // Accessibility check on empty generate workspace
    const accessibilityScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    expect(
      accessibilityScan.violations.filter(
        (item) => item.impact === "serious" || item.impact === "critical",
      ),
    ).toEqual([]);

    // Fill in prompt
    const promptInput = page.getByLabel(/Prompt Description/i);
    await promptInput.fill(
      "High energy breaking news theme with driving brass",
    );

    // Verify dry run status badge is visible
    await expect(page.getByText(/Dry Run/i).first()).toBeVisible();

    // Trigger generation
    const generateBtn = page.getByRole("button", { name: /Generate Audio/i });
    await generateBtn.click();

    // Wait for generation result
    await expect(
      page.getByRole("heading", { name: "Generation Output" }),
    ).toBeVisible();
    await expect(page.getByText("AI Provenance Record")).toBeVisible();
    await expect(page.getByLabel("Generated audio preview")).toBeVisible();

    // Commit as draft submission
    const saveBtn = page.getByRole("button", {
      name: /Commit as Draft Submission/i,
    });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Confirm saved notification appears with view submission link
    await expect(page.getByText("Saved as Draft Submission")).toBeVisible();
    const viewDraftLink = page.getByRole("link", {
      name: /View Draft Submission/i,
    });
    await expect(viewDraftLink).toBeVisible();
  });

  test("displays similar tracks panel on published track detail", async ({
    page,
  }) => {
    // Find an existing published track
    const result = await pool.query<{ id: string }>(
      `SELECT id FROM catalog.track WHERE publication_status = 'published' LIMIT 1`,
    );
    const trackId = result.rows[0]?.id;
    test.skip(!trackId, "Requires at least one published track in database");

    await signInAs(page, "user", `/library/${trackId}`);

    // Verify track detail loaded
    await expect(
      page.getByRole("heading", { name: "Canonical metadata" }),
    ).toBeVisible();

    // Verify Similar published tracks section is rendered
    const similarHeading = page.getByRole("heading", {
      name: "Similar published tracks",
    });
    await expect(similarHeading).toBeVisible();

    // Run accessibility check on track detail with similar tracks panel
    const accessibilityScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    expect(
      accessibilityScan.violations.filter(
        (item) => item.impact === "serious" || item.impact === "critical",
      ),
    ).toEqual([]);
  });
});
