import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("root redirects to the dashboard", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/dashboard$/);
});

test("dashboard renders without console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/dashboard");

  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("brand-lockup").first()).toContainText(
    "Times SoundVault",
  );
  expect(consoleErrors).toEqual([]);
});

test("desktop primary navigation works and has accessible names", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");

  const navigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  const libraryLink = navigation.getByRole("link", { name: "Library" });

  await expect(libraryLink).toHaveAccessibleName("Library");
  await libraryLink.click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(
    page.getByRole("heading", { name: "Library", level: 1 }),
  ).toBeVisible();
});

test("mobile navigation opens from the keyboard and closes with Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");

  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");

  const navigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Generate" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(navigation).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("dashboard has no serious automated accessibility violations", async ({
  page,
}) => {
  await page.goto("/dashboard");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const seriousViolations = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );

  expect(seriousViolations).toEqual([]);
});
