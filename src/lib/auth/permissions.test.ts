import { describe, expect, it } from "vitest";

import { canAccessRoute, getNavigationForRole } from "@/lib/auth/permissions";

describe("role navigation", () => {
  it("includes every current destination for an Admin", () => {
    expect(getNavigationForRole("admin").map((item) => item.label)).toEqual([
      "Dashboard",
      "Library",
      "Generate",
      "Upload",
      "Admin",
    ]);
  });

  it("includes the Reviewer destinations", () => {
    expect(getNavigationForRole("reviewer").map((item) => item.label)).toEqual([
      "Dashboard",
      "Library",
      "Generate",
    ]);
  });

  it("excludes privileged destinations for a Reviewer", () => {
    const labels = getNavigationForRole("reviewer").map((item) => item.label);

    expect(labels).not.toContain("Upload");
    expect(labels).not.toContain("Admin");
  });
});

describe("route permissions", () => {
  it.each(["/upload", "/admin"] as const)(
    "denies Reviewer access to %s",
    (route) => {
      expect(canAccessRoute("reviewer", route)).toBe(false);
    },
  );

  it.each([
    "/dashboard",
    "/library",
    "/generate",
    "/upload",
    "/admin",
  ] as const)("permits Admin access to %s", (route) => {
    expect(canAccessRoute("admin", route)).toBe(true);
  });
});
