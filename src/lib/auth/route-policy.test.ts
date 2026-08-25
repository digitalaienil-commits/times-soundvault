import { describe, expect, it } from "vitest";

import type { WorkspaceRoute } from "@/types/navigation";

import {
  canAccessRouteFamily,
  canAccessRoute,
  getDefaultRouteForRole,
  matchWorkspaceRoute,
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
      [
        "/dashboard",
        "/library",
        "/my-uploads",
        "/upload",
        "/review",
        "/copyright",
        "/demands",
      ],
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

  it("matches only exact dynamic route families", () => {
    expect(
      matchWorkspaceRoute("/upload/550e8400-e29b-41d4-a716-446655440000"),
    ).toBe("/upload/[batchId]");
    expect(matchWorkspaceRoute("/submissions/example")).toBe(
      "/submissions/[submissionId]",
    );
    expect(matchWorkspaceRoute("/review/example")).toBe(
      "/review/[submissionId]",
    );
    expect(matchWorkspaceRoute("/library/example")).toBe("/library/[trackId]");
    expect(matchWorkspaceRoute("/copyright/batches/example")).toBe(
      "/copyright/batches/[batchId]",
    );
    expect(matchWorkspaceRoute("/uploading/example")).toBeNull();
    expect(matchWorkspaceRoute("/upload/example/extra")).toBeNull();
    expect(canAccessRouteFamily("user", "/upload/[batchId]")).toBe(false);
    expect(canAccessRouteFamily("user", "/library/[trackId]")).toBe(true);
    expect(canAccessRouteFamily("coordinator", "/review/[submissionId]")).toBe(
      true,
    );
    expect(
      canAccessRouteFamily("music_producer", "/review/[submissionId]"),
    ).toBe(false);
    expect(
      canAccessRouteFamily("coordinator", "/submissions/[submissionId]"),
    ).toBe(true);
    expect(
      canAccessRouteFamily("music_producer", "/copyright/batches/[batchId]"),
    ).toBe(false);
  });

  it("lands User in Library and operational roles in Dashboard", () => {
    expect(getDefaultRouteForRole("user")).toBe("/library");
    expect(getDefaultRouteForRole("admin")).toBe("/dashboard");
    expect(getDefaultRouteForRole("music_producer")).toBe("/dashboard");
    expect(getDefaultRouteForRole("coordinator")).toBe("/dashboard");
  });
});
