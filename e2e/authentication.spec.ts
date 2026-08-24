import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const testDatabase = databaseUrl
  ? new Pool({ connectionString: databaseUrl, max: 1 })
  : null;

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

async function signIn(
  page: Page,
  identity: { email: string; accessName: string },
  expectedPath: string,
  callbackUrl = expectedPath,
) {
  expect(identity.email).not.toBe("");
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
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

async function expectNavigation(
  page: Page,
  visible: string[],
  hidden: string[],
) {
  const navigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  for (const label of visible) {
    await expect(
      navigation.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }
  for (const label of hidden) {
    await expect(
      navigation.getByRole("link", { name: label, exact: true }),
    ).toHaveCount(0);
  }
  await expect(navigation.getByRole("link", { name: "Generate" })).toHaveCount(
    0,
  );
}

async function openMemberActions(page: Page, email: string) {
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  const summary = row.getByText("Manage access", { exact: true });
  const isOpen = await summary.evaluate(
    (element) => element.closest("details")?.hasAttribute("open") ?? false,
  );
  if (!isOpen) {
    await summary.click();
  }
  return row;
}

async function openRoleChangeDialog(
  page: Page,
  email: string,
  role: "admin" | "music_producer" | "coordinator" | "user",
) {
  const dialog = page.getByRole("alertdialog");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await dialog.isVisible()) return dialog;
    const row = await openMemberActions(page, email);
    try {
      await row
        .getByLabel("Assigned role")
        .selectOption(role, { timeout: 2_500 });
      await row
        .getByRole("button", { name: "Review role change" })
        .click({ timeout: 2_500 });
      await expect(dialog).toBeVisible({ timeout: 2_500 });
      return dialog;
    } catch {
      await page.waitForTimeout(100);
    }
  }
  await expect(dialog).toBeVisible();
  return dialog;
}

async function changeMemberStatus(
  page: Page,
  email: string,
  operation: "suspend" | "reactivate",
) {
  const row = await openMemberActions(page, email);
  await row
    .getByRole("button", {
      name:
        operation === "suspend" ? "Review suspension" : "Review reactivation",
    })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", {
      name: operation === "suspend" ? "Suspend access" : "Reactivate access",
    })
    .click();
  await expect(
    page.getByText(
      operation === "suspend" ? /Access suspended/ : /Access reactivated/,
    ),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function createAuthenticatedPages(browser: Browser) {
  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  return {
    adminContext,
    memberContext,
    adminPage: await adminContext.newPage(),
    memberPage: await memberContext.newPage(),
  };
}

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

test.beforeEach(async () => {
  if (!testDatabase) {
    throw new Error("DATABASE_URL is required for authentication E2E tests");
  }
  await testDatabase.query(`DELETE FROM auth."rateLimit"`);
});

test.afterAll(async () => {
  await testDatabase?.end();
});

test("unauthenticated routes preserve safe callbacks and Sign In is accessible", async ({
  page,
}) => {
  await page.goto("/review?status=pending");
  await expect(page).toHaveURL(
    /\/sign-in\?callbackUrl=%2Freview%3Fstatus%3Dpending$/,
  );
  await expect(
    page.getByText("Local development authentication"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /register|create account/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /role/i })).toHaveCount(0);

  const accessNames = ["Admin", "Music Producer", "Coordinator", "User"];
  for (const accessName of accessNames) {
    await expect(
      page.getByRole("button", {
        name: `Enter as ${accessName}`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Enter as Admin", exact: true })
    .focus();
  for (const accessName of accessNames) {
    await expect(
      page.getByRole("button", {
        name: `Enter as ${accessName}`,
        exact: true,
      }),
    ).toBeFocused();
    if (accessName !== accessNames.at(-1)) {
      await page.keyboard.press("Tab");
    }
  }

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
});

test("malicious callbacks fail closed", async ({ page }) => {
  await page.goto("/sign-in?callbackUrl=https://evil.example");
  await page
    .getByRole("button", { name: "Enter as Admin", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
});

test("Admin sees every route and can manage pending access", async ({
  page,
}) => {
  await signIn(page, identities.admin, "/dashboard");
  await expectNavigation(
    page,
    [
      "Dashboard",
      "Library",
      "Submissions",
      "Review Queue",
      "Copyright",
      "Upload",
      "Demand Sheet",
      "Team",
      "Admin",
    ],
    ["My Uploads"],
  );

  for (const [path, heading] of [
    ["/dashboard", "Dashboard"],
    ["/library", "Library"],
    ["/my-uploads", "Submissions"],
    ["/review", "Review Queue"],
    ["/copyright", "Copyright Checks"],
    ["/upload", "Upload"],
    ["/demands", "Demand Sheet"],
    ["/team", "Team"],
    ["/admin", "Admin"],
  ] as const) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
  }

  await page.goto("/team");
  const suffix = Date.now();
  const pendingUser = `e2e-user-${suffix}@soundvault.test`;
  const pendingProducer = `e2e-producer-${suffix}@soundvault.test`;
  for (const [email, role] of [
    [pendingUser, "user"],
    [pendingProducer, "music_producer"],
  ] as const) {
    await page.getByLabel("Corporate email").fill(email);
    await page.getByLabel("Display name").fill(`E2E ${role}`);
    await page.getByLabel("Role", { exact: true }).selectOption(role);
    await page.getByRole("button", { name: "Add member" }).click();
    await expect(page.getByText(/Team member added/)).toBeVisible();
    await page.waitForLoadState("networkidle");
  }

  let roleDialog = await openRoleChangeDialog(page, pendingUser, "coordinator");
  await expect(
    roleDialog.getByRole("heading", { name: "Confirm role change" }),
  ).toBeVisible();
  const cancelRole = roleDialog.getByRole("button", { name: "Cancel" });
  await expect(cancelRole).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(roleDialog).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""),
    )
    .toMatch(/Review role change|Manage access/);
  roleDialog = await openRoleChangeDialog(page, pendingUser, "coordinator");
  const confirmRole = page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Change role and revoke sessions" });
  await confirmRole.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Role changed/)).toBeVisible();
  await page.waitForLoadState("networkidle");

  await changeMemberStatus(page, pendingUser, "suspend");
  await changeMemberStatus(page, pendingUser, "reactivate");

  roleDialog = await openRoleChangeDialog(page, identities.admin.email, "user");
  await roleDialog
    .getByRole("button", { name: "Change role and revoke sessions" })
    .click();
  await expect(page.getByText(/final active Admin cannot/i)).toBeVisible();
  await page.waitForLoadState("networkidle");

  const accountMenu = page.getByRole("button", { name: /Open account menu/ });
  await accountMenu.focus();
  await page.keyboard.press("Enter");
  const signOut = page.getByRole("button", { name: "Sign Out" });
  await signOut.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("Music Producer navigation and server routes match the permission model", async ({
  page,
}) => {
  await signIn(page, identities.producer, "/dashboard");
  await expectNavigation(
    page,
    ["Dashboard", "Library", "My Uploads", "Upload", "Demand Sheet"],
    ["Review Queue", "Copyright", "Team", "Admin", "Submissions"],
  );
  for (const path of ["/review", "/copyright", "/team", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/access-denied$/);
  }
});

test("Coordinator navigation and server routes match the permission model", async ({
  page,
}) => {
  await signIn(page, identities.coordinator, "/dashboard");
  await expectNavigation(
    page,
    [
      "Dashboard",
      "Library",
      "My Uploads",
      "Review Queue",
      "Copyright",
      "Upload",
      "Demand Sheet",
    ],
    ["Submissions", "Team", "Admin"],
  );
  await page.goto("/copyright");
  await expect(page.getByText("Manual mode", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/must never be registered as Content ID references/),
  ).toBeVisible();
  const copyrightResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    copyrightResults.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
  for (const path of ["/team", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/access-denied$/);
  }
});

test("User lands in Library and cannot reach privileged routes", async ({
  page,
}) => {
  await signIn(page, identities.user, "/library", "/");
  await expect(
    page.getByRole("heading", { name: "No published tracks yet" }),
  ).toBeVisible();
  await expectNavigation(
    page,
    ["Library"],
    [
      "Dashboard",
      "My Uploads",
      "Submissions",
      "Upload",
      "Review Queue",
      "Copyright",
      "Demand Sheet",
      "Team",
      "Admin",
    ],
  );
  for (const path of [
    "/dashboard",
    "/upload",
    "/review",
    "/copyright",
    "/demands",
    "/team",
    "/admin",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/access-denied$/);
  }
});

test("database-backed domain states remain responsive and accessible", async ({
  page,
}) => {
  await signIn(page, identities.admin, "/dashboard");
  const destinations = [
    ["/library", /No published tracks yet|Published tracks/],
    ["/my-uploads", /No submissions yet|Upload submissions/],
    ["/review", /Oldest waiting first/],
    ["/copyright", /Current checks/],
  ] as const;

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [path, emptyHeading] of destinations) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: emptyHeading, level: 2 }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }

  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect(
    page.getByRole("heading", {
      name: "Current checks",
    }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
});

test("suspension revokes an already active session", async ({ browser }) => {
  const { adminContext, memberContext, adminPage, memberPage } =
    await createAuthenticatedPages(browser);
  try {
    await signIn(adminPage, identities.admin, "/dashboard");
    await signIn(memberPage, identities.user, "/library");
    await adminPage.goto("/team");
    await changeMemberStatus(adminPage, identities.user.email, "suspend");

    await memberPage.goto("/library");
    await expect(memberPage).toHaveURL(/\/sign-in\?callbackUrl=%2Flibrary$/);

    await changeMemberStatus(adminPage, identities.user.email, "reactivate");
  } finally {
    await adminContext.close();
    await memberContext.close();
  }
});

test("role changes revoke the old session and apply new navigation after sign in", async ({
  browser,
}) => {
  const { adminContext, memberContext, adminPage, memberPage } =
    await createAuthenticatedPages(browser);
  try {
    await signIn(adminPage, identities.admin, "/dashboard");
    await signIn(memberPage, identities.producer, "/dashboard");
    await adminPage.goto("/team");

    let roleDialog = await openRoleChangeDialog(
      adminPage,
      identities.producer.email,
      "coordinator",
    );
    await roleDialog
      .getByRole("button", { name: "Change role and revoke sessions" })
      .click();
    await expect(adminPage.getByText(/Role changed/)).toBeVisible();
    await adminPage.waitForLoadState("networkidle");

    await memberPage.goto("/dashboard");
    await expect(memberPage).toHaveURL(/\/sign-in\?callbackUrl=%2Fdashboard$/);
    await signIn(memberPage, identities.producer, "/dashboard");
    await expectNavigation(
      memberPage,
      [
        "Dashboard",
        "Library",
        "My Uploads",
        "Review Queue",
        "Copyright",
        "Upload",
        "Demand Sheet",
      ],
      ["Team", "Admin"],
    );

    roleDialog = await openRoleChangeDialog(
      adminPage,
      identities.producer.email,
      "music_producer",
    );
    await roleDialog
      .getByRole("button", { name: "Change role and revoke sessions" })
      .click();
    await expect(adminPage.getByText(/Role changed/)).toBeVisible();
    await adminPage.waitForLoadState("networkidle");
  } finally {
    await adminContext.close();
    await memberContext.close();
  }
});

test("Team management remains usable across responsive sizes and 200% zoom", async ({
  page,
}) => {
  await signIn(page, identities.admin, "/dashboard");
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/team");
    await expect(
      page.getByRole("heading", { name: "Team", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add member" }),
    ).toBeVisible();
    if (viewport.width === 390) {
      const navigationTrigger = page.getByRole("button", {
        name: "Open navigation",
      });
      await navigationTrigger.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("navigation", { name: "Primary navigation" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(navigationTrigger).toBeFocused();
    }
  }

  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect(
    page.getByRole("heading", { name: "Team", level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel("Corporate email")).toBeVisible();
});

test("authenticated dashboard emits no browser console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await signIn(page, identities.admin, "/dashboard");
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
