import { describe, expect, it } from "vitest";

import type { CurrentUser } from "@/types/auth";

import {
  canManageDemand,
  canRespondToDemand,
  canSeeDemand,
  canSeeResponse,
} from "./authorization";

const user = (role: CurrentUser["role"], id: string = role): CurrentUser => ({
  id,
  role,
  name: role,
  email: `${role}@example.test`,
  initials: role.slice(0, 2).toUpperCase(),
  accessStatus: "active",
});

describe("Demand authorization", () => {
  it("hides drafts from Producers but exposes open Demand work", () => {
    expect(canSeeDemand(user("music_producer"), "draft")).toBe(false);
    expect(canSeeDemand(user("music_producer"), "open")).toBe(true);
    expect(canSeeDemand(user("coordinator"), "draft")).toBe(true);
  });

  it("keeps ordinary Users outside Demand Sheet", () => {
    expect(canSeeDemand(user("user"), "open")).toBe(false);
    expect(canRespondToDemand(user("user"))).toBe(false);
    expect(canManageDemand(user("user"))).toBe(false);
  });

  it("shows Producers only their own responses while managers can see all", () => {
    expect(canSeeResponse(user("music_producer", "p1"), "p1")).toBe(true);
    expect(canSeeResponse(user("music_producer", "p1"), "p2")).toBe(false);
    expect(canSeeResponse(user("coordinator", "c1"), "p2")).toBe(true);
    expect(canSeeResponse(user("admin", "a1"), "p2")).toBe(true);
  });
});
