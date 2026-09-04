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

function testOrigin() {
  return (
    process.env.PLAYWRIGHT_BASE_URL ??
    `http://localhost:${process.env.PORT ?? process.env.PLAYWRIGHT_PORT ?? "3005"}`
  );
}

function cookieFromHeader(cookieHeader: string, origin: string) {
  const [nameValue] = cookieHeader.split(";");
  const equalsIndex = nameValue.indexOf("=");
  if (equalsIndex <= 0) {
    throw new Error("Local sign-in response did not include a valid cookie");
  }
  return {
    name: nameValue.slice(0, equalsIndex),
    value: nameValue.slice(equalsIndex + 1),
    url: origin,
  };
}

async function localSessionCookies(
  role: "admin" | "music_producer" | "coordinator" | "user",
  callbackUrl: string,
) {
  const origin = testOrigin();
  const response = await fetch(`${origin}/api/local-auth/direct-sign-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: origin,
    },
    body: new URLSearchParams({
      role,
      callbackUrl,
    }),
    redirect: "manual",
  });
  expect(response.status).toBe(303);

  const responseHeaders = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies =
    responseHeaders.getSetCookie?.() ??
    (response.headers.get("set-cookie")
      ? [response.headers.get("set-cookie")!]
      : []);
  expect(cookies.length).toBeGreaterThan(0);
  return cookies.filter((cookie) => cookie.includes("="));
}

function cookieHeader(cookies: string[]) {
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function signInAs(
  page: Page,
  role: "admin" | "music_producer" | "coordinator" | "user",
  destination?: string,
) {
  await page.context().clearCookies();
  const callback = destination ?? (role === "user" ? "/library" : "/dashboard");
  const origin = testOrigin();
  const cookies = await localSessionCookies(role, callback);
  await page
    .context()
    .addCookies(cookies.map((cookie) => cookieFromHeader(cookie, origin)));

  await page.goto(callback, {
    waitUntil: "domcontentloaded",
  });
  await expect(page).toHaveURL(new RegExp(`${callback.replace("/", "\\/")}$`));
  await expect(page.locator("#main-content")).toBeVisible();
}

test.describe("Section 13 Similarity Search and AI Music Generation", () => {
  test("enforces /generate role boundaries server-side", async () => {
    const origin = testOrigin();

    for (const role of [
      "user",
      "music_producer",
      "coordinator",
      "admin",
    ] as const) {
      const cookies = await localSessionCookies(role, "/generate");
      const response = await fetch(`${origin}/generate`, {
        headers: { Cookie: cookieHeader(cookies) },
        redirect: "manual",
      });

      if (role === "user") {
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("/access-denied");
      } else {
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("AI Music Generation");
      }
    }
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
    await promptInput.click();
    await promptInput.pressSequentially(
      "High energy breaking news theme with driving brass",
      { delay: 1 },
    );

    // Verify dry run status badge is visible
    await expect(page.getByText(/Dry Run/i).first()).toBeVisible();

    // Trigger generation
    const generateBtn = page.getByRole("button", { name: /Generate Audio/i });
    await expect(generateBtn).toBeEnabled();
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
