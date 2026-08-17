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
});
