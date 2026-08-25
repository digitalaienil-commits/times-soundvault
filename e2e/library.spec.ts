import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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
