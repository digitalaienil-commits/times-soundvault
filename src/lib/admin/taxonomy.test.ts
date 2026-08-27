import { describe, expect, it } from "vitest";

import { taxonomyTermInputSchema, toTaxonomySlug } from "./taxonomy";

describe("admin taxonomy governance", () => {
  it("normalizes labels into stable slugs", () => {
    expect(toTaxonomySlug("  Big Bollywood Hook!  ")).toBe(
      "big-bollywood-hook",
    );
    expect(toTaxonomySlug("Folk__Percussion///Loop")).toBe(
      "folk-percussion-loop",
    );
  });

  it("accepts only canonical taxonomy categories and safe slugs", () => {
    expect(
      taxonomyTermInputSchema.parse({
        category: "use_case",
        label: "Promo Bed",
        slug: "promo-bed",
        sortOrder: 10,
      }),
    ).toMatchObject({ category: "use_case", slug: "promo-bed" });
    expect(() =>
      taxonomyTermInputSchema.parse({
        category: "playlist",
        label: "Morning",
        slug: "morning",
      }),
    ).toThrow();
    expect(() =>
      taxonomyTermInputSchema.parse({
        category: "genre",
        label: "Unsafe Slug",
        slug: "Unsafe Slug",
      }),
    ).toThrow();
  });
});
