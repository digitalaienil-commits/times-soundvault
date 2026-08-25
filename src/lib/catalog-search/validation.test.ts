import { describe, expect, it } from "vitest";

import {
  CatalogSearchValidationError,
  parseCatalogSearchParams,
  queryHasPositiveTerm,
} from "./validation";

describe("catalog search validation", () => {
  it("parses repeatable URL filters and bounded ranges", () => {
    expect(
      parseCatalogSearchParams({
        q: '"breaking news" -sports',
        type: ["sound_effect", "music"],
        useCase: ["breaking-news", "headlines"],
        bpmMin: "80",
        energyMax: "75",
        hasStems: "yes",
      }),
    ).toMatchObject({
      query: '"breaking news" -sports',
      assetKinds: ["sound_effect", "music"],
      useCases: ["breaking-news", "headlines"],
      bpmMin: 80,
      energyMax: 0.75,
      hasStems: true,
    });
  });

  it.each([
    [{ pageSize: "61" }],
    [{ bpmMin: "200", bpmMax: "100" }],
    [{ publishedAfter: "2026-10-01", publishedBefore: "2026-01-01" }],
    [{ type: "draft" }],
    [{ genre: "x' OR 1=1 --" }],
  ])("rejects malformed or unbounded input", (params) => {
    expect(() => parseCatalogSearchParams(params)).toThrow(
      CatalogSearchValidationError,
    );
  });

  it("requires a positive term for an exclusion query", () => {
    expect(queryHasPositiveTerm("-sports -promo")).toBe(false);
    expect(queryHasPositiveTerm('"breaking news" -sports')).toBe(true);
  });
});
