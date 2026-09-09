import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

describe("workspace proxy", () => {
  it("redirects signed-out requests with the exact protected route", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/library?query=calm&page=2"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?callbackUrl=%2Flibrary%3Fquery%3Dcalm%26page%3D2",
    );
  });

  it("forwards the exact route to server authorization for likely sessions", () => {
    const request = new NextRequest(
      "http://localhost:3000/library?query=calm",
      {
        headers: {
          cookie: "better-auth.session_token=stale-session",
        },
      },
    );

    const response = proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-override-headers")).toContain(
      "x-soundvault-callback",
    );
    expect(
      response.headers.get("x-middleware-request-x-soundvault-callback"),
    ).toBe("/library?query=calm");
  });

  it("redirects the generation workspace when signed out", () => {
    const response = proxy(new NextRequest("http://localhost:3000/generate"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?callbackUrl=%2Fgenerate",
    );
  });

  it("lets the sign-in page render without redirecting", () => {
    const response = proxy(new NextRequest("http://localhost:3000/sign-in"));

    expect(response.status).toBe(200);
  });

  it("sets a per-request nonce policy on pages and redirects alike", () => {
    const page = proxy(new NextRequest("http://localhost:3000/sign-in"));
    const redirect = proxy(new NextRequest("http://localhost:3000/dashboard"));

    for (const response of [page, redirect]) {
      const policy = response.headers.get("Content-Security-Policy") ?? "";
      expect(policy).toMatch(/script-src [^;]*'nonce-[a-f0-9]{32}'/);
      expect(policy).toContain("frame-ancestors 'none'");
    }

    const first = page.headers.get("Content-Security-Policy");
    const second = proxy(
      new NextRequest("http://localhost:3000/sign-in"),
    ).headers.get("Content-Security-Policy");
    expect(first).not.toBe(second);
  });

  it("exposes the nonce to the renderer through request headers", () => {
    const response = proxy(new NextRequest("http://localhost:3000/sign-in"));

    expect(response.headers.get("x-middleware-override-headers")).toContain(
      "x-nonce",
    );
    expect(response.headers.get("x-middleware-request-x-nonce")).toMatch(
      /^[a-f0-9]{32}$/,
    );
  });
});
