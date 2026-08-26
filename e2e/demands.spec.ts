import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl, max: 1 })
  : null;

const identities = {
  producer: { accessName: "Music Producer" },
  coordinator: { accessName: "Coordinator" },
  user: { accessName: "User" },
};

async function signIn(
  page: Page,
  identity: { accessName: string },
  expectedPath: string,
) {
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(expectedPath)}`);
  await page
    .getByRole("button", {
      name: `Enter as ${identity.accessName}`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`${expectedPath.replaceAll("/", "\\/")}$`),
  );
}

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

test.beforeAll(async () => {
  if (!database) throw new Error("DATABASE_URL is required for Demand E2E");
  await database.query(
    `INSERT INTO catalog.taxonomy_term (id,category,slug,label)
     VALUES
       ('81000000-0000-4000-8000-000000000001','use_case','e2e-elections','Elections E2E'),
       ('81000000-0000-4000-8000-000000000002','format','e2e-background-bed','Background Bed E2E'),
       ('81000000-0000-4000-8000-000000000003','mood','e2e-tense','Tense E2E')
     ON CONFLICT (category,slug) DO UPDATE SET label=excluded.label,is_active=true`,
  );
});

test.afterAll(async () => {
  await database?.end();
});

test("User and Producer Demand route boundaries are enforced server-side", async ({
  browser,
}) => {
  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await signIn(userPage, identities.user, "/library");
  await userPage.goto("/demands");
  await expect(userPage).toHaveURL(/\/access-denied$/);
  await userContext.close();

  const producerContext = await browser.newContext();
  const producerPage = await producerContext.newPage();
  await signIn(producerPage, identities.producer, "/demands");
  await expect(
    producerPage.getByRole("link", { name: "New Demand" }),
  ).toHaveCount(0);
  await producerPage.goto("/demands/new");
  await expect(producerPage).toHaveURL(/\/access-denied$/);
  await producerPage.goto("/demands/550e8400-e29b-41d4-a716-446655440000/edit");
  await expect(producerPage).toHaveURL(/\/access-denied$/);
  await producerContext.close();
});

test("Coordinator creates a draft, opens it, and Producer receives a private responsive brief", async ({
  browser,
}) => {
  const coordinatorContext = await browser.newContext();
  const coordinatorPage = await coordinatorContext.newPage();
  await signIn(coordinatorPage, identities.coordinator, "/demands");
  await coordinatorPage.getByRole("link", { name: "New Demand" }).click();
  await expect(
    coordinatorPage.getByRole("heading", { name: "New Demand", level: 1 }),
  ).toBeVisible();

  await coordinatorPage.getByLabel("Title").fill("Election Results Music");
  await coordinatorPage.getByLabel("Requesting team").fill("News");
  await coordinatorPage
    .getByLabel("Project / context")
    .fill("Election Results Coverage");
  await coordinatorPage.getByLabel("Priority").selectOption("high");
  await coordinatorPage.getByLabel("Response deadline").fill("2099-09-01");
  await coordinatorPage.getByLabel("Needed by").fill("2099-09-05");
  await coordinatorPage.getByLabel("Target Tracks").fill("2");
  await coordinatorPage
    .getByRole("textbox", { name: "Brief", exact: true })
    .fill(
      "Instrumental background beds for national election results coverage.",
    );
  await coordinatorPage.getByLabel("Vocal").selectOption("instrumental");
  await coordinatorPage.getByLabel("Under dialogue").selectOption("yes");
  await coordinatorPage
    .getByLabel("Required taxonomy requirements")
    .selectOption([
      { label: "Elections E2E" },
      { label: "Background Bed E2E" },
    ]);
  await coordinatorPage
    .getByLabel("Preferred taxonomy requirements")
    .selectOption([{ label: "Tense E2E" }]);
  await coordinatorPage.getByRole("button", { name: "Save Draft" }).click();
  await expect(coordinatorPage).toHaveURL(/\/demands\/[0-9a-f-]+$/);
  const demandUrl = new URL(coordinatorPage.url()).pathname;
  await expect(
    coordinatorPage.getByRole("heading", {
      name: "Election Results Music",
      level: 1,
    }),
  ).toBeVisible();

  const producerContext = await browser.newContext();
  const producerPage = await producerContext.newPage();
  await signIn(producerPage, identities.producer, "/demands");
  await producerPage.goto(demandUrl);
  await expect(
    producerPage.getByRole("heading", {
      name: "This page is outside the vault.",
    }),
  ).toBeVisible();

  await coordinatorPage.goto(demandUrl);
  await coordinatorPage.getByRole("button", { name: "Open Demand" }).click();
  await expect(
    coordinatorPage.getByRole("button", { name: "Close Demand" }),
  ).toBeVisible();
  await producerPage.goto(demandUrl);
  await expect(
    producerPage.getByRole("heading", {
      name: "Election Results Music",
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    producerPage.getByText("Required", { exact: true }),
  ).toBeVisible();
  await expect(
    producerPage.getByText("Preferred", { exact: true }),
  ).toBeVisible();
  await expect(
    producerPage.getByRole("link", { name: "Find existing music" }),
  ).toBeVisible();
  await expect(
    producerPage.getByRole("link", {
      name: "Create new Track for this Demand",
    }),
  ).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await producerPage.setViewportSize(viewport);
    await producerPage.reload();
    await expect(
      producerPage
        .locator("body")
        .evaluate(
          (body) =>
            body.scrollWidth <= document.documentElement.clientWidth + 1,
        ),
    ).resolves.toBe(true);
  }
  await producerPage.setViewportSize({ width: 1024, height: 768 });
  await producerPage.evaluate(() => {
    document.documentElement.style.zoom = "200%";
  });
  await expect(
    producerPage
      .locator("body")
      .evaluate(
        (body) => body.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
  ).resolves.toBe(true);
  await producerPage.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
  const results = await new AxeBuilder({ page: producerPage })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);

  const findExistingMusic = producerPage.getByRole("link", {
    name: "Find existing music",
  });
  await findExistingMusic.focus();
  await expect(findExistingMusic).toBeFocused();
  await producerPage.keyboard.press("Enter");
  await expect(
    producerPage.getByRole("heading", { name: "Find existing music" }),
  ).toBeVisible();
  await expect(producerPage.getByText("Elections E2E")).toBeVisible();
  await expect(producerPage.getByText("Tense E2E")).toBeVisible();
  await producerPage.goto(`/upload?demandId=${demandUrl.split("/").at(-1)}`);
  await expect(
    producerPage.getByText("Demand context", { exact: true }),
  ).toBeVisible();
  await expect(producerPage.getByText("Election Results Music")).toBeVisible();

  await producerContext.close();
  await coordinatorContext.close();
});
