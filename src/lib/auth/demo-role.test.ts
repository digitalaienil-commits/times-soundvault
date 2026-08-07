import { describe, expect, it } from "vitest";

import { resolveDemoRole } from "@/lib/auth/demo-role";

describe("demo role resolution", () => {
  it.each(["admin", "reviewer"] as const)(
    "accepts the supported %s role",
    (role) => {
      expect(resolveDemoRole(role, "production")).toBe(role);
    },
  );

  it("defaults an absent local role to Admin", () => {
    expect(resolveDemoRole(undefined, "development")).toBe("admin");
  });

  it("defaults an absent production role to Reviewer", () => {
    expect(resolveDemoRole(undefined, "production")).toBe("reviewer");
  });

  it("falls back to Reviewer for an invalid value in every environment", () => {
    expect(resolveDemoRole("owner", "development")).toBe("reviewer");
    expect(resolveDemoRole("owner", "production")).toBe("reviewer");
  });
});
