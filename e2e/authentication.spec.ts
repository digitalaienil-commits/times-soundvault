import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

const identities = {
  admin: {
    email: process.env.LOCAL_ADMIN_EMAIL ?? "",
    password: process.env.LOCAL_ADMIN_PASSWORD ?? "",
  },
  producer: {
    email: process.env.LOCAL_PRODUCER_EMAIL ?? "",
    password: process.env.LOCAL_PRODUCER_PASSWORD ?? "",
  },
  coordinator: {
    email: process.env.LOCAL_COORDINATOR_EMAIL ?? "",
    password: process.env.LOCAL_COORDINATOR_PASSWORD ?? "",
  },
  user: {
    email: process.env.LOCAL_USER_EMAIL ?? "",
    password: process.env.LOCAL_USER_PASSWORD ?? "",
  },
};

async function signIn(
  page: Page,
  identity: { email: string; password: string },
  expectedPath: string,
  callbackUrl = "/",
) {
  expect(identity.email).not.toBe("");
  expect(identity.password).not.toBe("");
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.getByLabel("Email").fill(identity.email);
  await page.getByLabel("Password").fill(identity.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${expectedPath.replace("/", "\\/")}$`),
  );
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
    await expect(navigation.getByRole("link", { name: label })).toBeVisible();
  }
  for (const label of hidden) {
    await expect(navigation.getByRole("link", { name: label })).toHaveCount(0);
  }
  await expect(navigation.getByRole("link", { name: "Generate" })).toHaveCount(
    0,
  );
}

async function openMemberActions(page: Page, email: string) {
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  const summary = row.getByText("Manage access", { exact: true });
  if (!(await summary.getAttribute("open"))) {
    await summary.click();
  }
  return row;
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
  await expect(page.getByText(/choose.*role/i)).toHaveCount(0);

  const email = page.getByLabel("Email");
  await email.focus();
  await expect(email).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeFocused();

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
  await page.getByLabel("Email").fill(identities.admin.email);
  await page.getByLabel("Password").fill(identities.admin.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
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
  }

  let row = await openMemberActions(page, pendingUser);
  await row.getByLabel("Assigned role").selectOption("coordinator");
  const roleTrigger = row.getByRole("button", { name: "Review role change" });
  await roleTrigger.focus();
  await page.keyboard.press("Enter");
  const roleDialog = page.getByRole("alertdialog");
  await expect(
    roleDialog.getByRole("heading", { name: "Confirm role change" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(roleTrigger).toBeFocused();
  await page.keyboard.press("Enter");
  const confirmRole = page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Change role and revoke sessions" });
  await confirmRole.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Role changed/)).toBeVisible();

  await changeMemberStatus(page, pendingUser, "suspend");
  await changeMemberStatus(page, pendingUser, "reactivate");

  row = await openMemberActions(page, identities.admin.email);
  await row.getByLabel("Assigned role").selectOption("user");
  await row.getByRole("button", { name: "Review role change" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Change role and revoke sessions" })
    .click();
  await expect(page.getByText(/final active Admin cannot/i)).toBeVisible();

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
    ["Review Queue", "Team", "Admin", "Submissions"],
  );
  for (const path of ["/review", "/team", "/admin"]) {
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
    ["Dashboard", "Library", "Review Queue", "Upload", "Demand Sheet"],
    ["My Uploads", "Submissions", "Team", "Admin"],
  );
  for (const path of ["/team", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/access-denied$/);
  }
});

test("User lands in Library and cannot reach privileged routes", async ({
  page,
}) => {
  await signIn(page, identities.user, "/library");
  await expectNavigation(
    page,
    ["Library"],
    [
      "Dashboard",
      "My Uploads",
      "Submissions",
      "Upload",
      "Review Queue",
      "Demand Sheet",
      "Team",
      "Admin",
    ],
  );
  for (const path of [
    "/dashboard",
    "/upload",
    "/review",
    "/demands",
    "/team",
    "/admin",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/access-denied$/);
  }
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

    let row = await openMemberActions(adminPage, identities.producer.email);
    await row.getByLabel("Assigned role").selectOption("coordinator");
    await row.getByRole("button", { name: "Review role change" }).click();
    await adminPage
      .getByRole("alertdialog")
      .getByRole("button", { name: "Change role and revoke sessions" })
      .click();
    await expect(adminPage.getByText(/Role changed/)).toBeVisible();

    await memberPage.goto("/dashboard");
    await expect(memberPage).toHaveURL(/\/sign-in\?callbackUrl=%2Fdashboard$/);
    await signIn(memberPage, identities.producer, "/dashboard");
    await expectNavigation(
      memberPage,
      ["Dashboard", "Library", "Review Queue", "Upload", "Demand Sheet"],
      ["My Uploads", "Team", "Admin"],
    );

    row = await openMemberActions(adminPage, identities.producer.email);
    await row.getByLabel("Assigned role").selectOption("music_producer");
    await row.getByRole("button", { name: "Review role change" }).click();
    await adminPage
      .getByRole("alertdialog")
      .getByRole("button", { name: "Change role and revoke sessions" })
      .click();
    await expect(adminPage.getByText(/Role changed/)).toBeVisible();
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
