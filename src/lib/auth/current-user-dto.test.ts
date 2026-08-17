import { describe, expect, it } from "vitest";

import { createInitials, toCurrentUser } from "./current-user-dto";
import type { TeamAccessRecord } from "@/types/team-access";

const access: TeamAccessRecord = {
  id: "7d18ee12-54dd-4c36-8b95-a84ccfb770ba",
  normalizedEmail: "person@company.example",
  displayName: "Person Example",
  role: "coordinator",
  status: "active",
  authUserId: "user-1",
  provider: "google",
  providerAccountId: "provider-1",
  createdByUserId: "admin-1",
  createdAt: new Date("2026-08-17T00:00:00Z"),
  updatedAt: new Date("2026-08-17T00:00:00Z"),
  activatedAt: new Date("2026-08-17T00:00:00Z"),
  suspendedAt: null,
  lastRoleChangedAt: null,
};

describe("current-user DTO", () => {
  it("returns only the intentional shell fields", () => {
    const result = toCurrentUser(
      { id: "user-1", name: "Person Example", email: "person@company.example" },
      access,
    );
    expect(result).toEqual({
      id: "user-1",
      name: "Person Example",
      email: "person@company.example",
      initials: "PE",
      role: "coordinator",
      accessStatus: "active",
    });
    expect(result).not.toHaveProperty("accessToken");
    expect(result).not.toHaveProperty("providerAccountId");
  });

  it("fails closed for suspended or mismatched assignments", () => {
    expect(
      toCurrentUser({ id: "other", name: "Other", email: "o@x.test" }, access),
    ).toBeNull();
    expect(
      toCurrentUser(
        { id: "user-1", name: "Person", email: "person@company.example" },
        { ...access, status: "suspended" },
      ),
    ).toBeNull();
  });

  it("creates safe initials fallbacks", () => {
    expect(createInitials("", "alpha@company.example")).toBe("A");
    expect(createInitials("", "_@company.example")).toBe("SV");
  });
});
