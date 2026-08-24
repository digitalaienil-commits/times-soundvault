import { describe, expect, it } from "vitest";

import { createCopyrightProvider } from "./provider";

describe("manual YouTube provider", () => {
  it("reports honestly that automation is disconnected", () => {
    expect(createCopyrightProvider().getCapabilities()).toEqual({
      connected: false,
      automation: false,
      reason:
        "YouTube automation is not configured. Results must be verified and recorded by a Coordinator or Admin.",
    });
  });
});
