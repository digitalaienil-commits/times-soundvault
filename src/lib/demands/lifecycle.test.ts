import { describe, expect, it } from "vitest";

import {
  assertDemandTransition,
  canTransitionDemand,
  deriveDemandState,
  responseWindowOpen,
} from "./lifecycle";

describe("Demand lifecycle", () => {
  it("allows only the explicit lifecycle transitions", () => {
    expect(canTransitionDemand("draft", "open")).toBe(true);
    expect(canTransitionDemand("open", "fulfilled")).toBe(true);
    expect(canTransitionDemand("fulfilled", "open")).toBe(true);
    expect(canTransitionDemand("closed", "open")).toBe(true);
    expect(canTransitionDemand("cancelled", "open")).toBe(false);
    expect(() => assertDemandTransition("draft", "fulfilled")).toThrow(
      /cannot move/,
    );
  });

  it("derives overdue, coverage and stale-acceptance attention without stored flags", () => {
    expect(
      deriveDemandState({
        status: "open",
        responseDeadlineOn: "2026-08-20",
        today: "2026-08-26",
        activeResponseCount: 1,
        acceptedCount: 2,
        validAcceptedCount: 1,
        targetTrackCount: 2,
      }),
    ).toEqual({
      overdue: true,
      inProgress: true,
      readyToFulfill: false,
      partiallyCovered: true,
      fulfillmentNeedsAttention: true,
    });
  });

  it("closes response creation after the deadline or outside open status", () => {
    expect(responseWindowOpen("open", "2026-08-26", "2026-08-26")).toBe(true);
    expect(responseWindowOpen("open", "2026-08-25", "2026-08-26")).toBe(false);
    expect(responseWindowOpen("closed", "2026-09-01", "2026-08-26")).toBe(
      false,
    );
  });
});
