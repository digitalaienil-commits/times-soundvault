import { describe, expect, it } from "vitest";

import type { WorkspaceRoute } from "@/types/navigation";

import {
  canAccessRoute,
  getDefaultRouteForRole,
  PROTECTED_ROUTES,
} from "./route-policy";

describe("server route policy", () => {
  it("allows Admin to access every protected route", () => {
    expect(
      PROTECTED_ROUTES.every((route) => canAccessRoute("admin", route)),
    ).toBe(true);
  });

  it.each([
    [
      "music_producer",
      ["/dashboard", "/library", "/my-uploads", "/upload", "/demands"],
    ],
    [
      "coordinator",
      ["/dashboard", "/library", "/upload", "/review", "/demands"],
    ],
    ["user", ["/library"]],
  ] as const)("enforces the %s route boundary", (role, allowed) => {
    const allowedRoutes = new Set<WorkspaceRoute>(allowed);
    for (const route of PROTECTED_ROUTES) {
      expect(canAccessRoute(role, route), route).toBe(allowedRoutes.has(route));
    }
  });

  it("fails closed for unknown roles independently of navigation", () => {
    expect(canAccessRoute("reviewer", "/library")).toBe(false);
  });

  it("lands User in Library and operational roles in Dashboard", () => {
    expect(getDefaultRouteForRole("user")).toBe("/library");
    expect(getDefaultRouteForRole("admin")).toBe("/dashboard");
    expect(getDefaultRouteForRole("music_producer")).toBe("/dashboard");
    expect(getDefaultRouteForRole("coordinator")).toBe("/dashboard");
  });
});
