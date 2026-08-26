import { describe, expect, it } from "vitest";

import { getNavigationForRole } from "@/config/navigation";
import {
  getPermissionsForRole,
  hasAllPermissions,
  hasPermission,
  PERMISSIONS,
} from "@/lib/auth/permissions";
import { USER_ROLES } from "@/types/auth";

describe("four-role permissions", () => {
  it("defines exactly the final four roles and rejects the historical role", () => {
    expect(USER_ROLES).toEqual([
      "admin",
      "music_producer",
      "coordinator",
      "user",
    ]);
    expect(getPermissionsForRole("reviewer")).toEqual([]);
    expect(getPermissionsForRole("owner")).toEqual([]);
  });

  it("gives Admin every canonical permission", () => {
    expect(getPermissionsForRole("admin")).toEqual(PERMISSIONS);
    expect(hasAllPermissions("admin", PERMISSIONS)).toBe(true);
  });

  it("keeps User limited to published-library capabilities", () => {
    expect(getPermissionsForRole("user")).toEqual([
      "workspace.access",
      "library.read",
      "audio.listen",
      "audio.download",
    ]);
    expect(hasPermission("user", "submission.create")).toBe(false);
  });

  it("gives Music Producer own-submission access without approval", () => {
    expect(hasPermission("music_producer", "submission.readOwn")).toBe(true);
    expect(hasPermission("music_producer", "submission.updateOwn")).toBe(true);
    expect(hasPermission("music_producer", "submission.approve")).toBe(false);
    expect(hasPermission("music_producer", "copyright.readOwn")).toBe(true);
    expect(hasPermission("music_producer", "copyright.prepare")).toBe(false);
  });

  it("gives Coordinator review, approval and demand access without team management", () => {
    expect(hasPermission("coordinator", "submission.readOwn")).toBe(true);
    expect(hasPermission("coordinator", "submission.updateOwn")).toBe(true);
    expect(hasPermission("coordinator", "submission.review")).toBe(true);
    expect(hasPermission("coordinator", "submission.approve")).toBe(true);
    expect(hasPermission("coordinator", "demand.manage")).toBe(true);
    expect(hasPermission("coordinator", "team.manage")).toBe(false);
    expect(hasPermission("coordinator", "copyright.readAll")).toBe(true);
    expect(hasPermission("coordinator", "copyright.record")).toBe(true);
    expect(hasPermission("user", "copyright.readOwn")).toBe(false);
  });
});

describe("role-aware navigation", () => {
  it.each([
    [
      "admin",
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
    ],
    [
      "music_producer",
      ["Dashboard", "Library", "My Uploads", "Upload", "Demand Sheet"],
    ],
    [
      "coordinator",
      [
        "Dashboard",
        "Library",
        "My Uploads",
        "Review Queue",
        "Copyright",
        "Upload",
        "Demand Sheet",
      ],
    ],
    ["user", ["Library"]],
  ] as const)("shows the intended %s navigation", (role, labels) => {
    expect(getNavigationForRole(role).map((item) => item.label)).toEqual(
      labels,
    );
  });

  it("does not expose navigation for malformed roles", () => {
    expect(getNavigationForRole("administrator")).toEqual([]);
  });
});
