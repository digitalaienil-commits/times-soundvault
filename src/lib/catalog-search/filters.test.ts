import { describe, expect, it } from "vitest";

import {
  catalogLibraryHref,
  catalogSearchInputToParams,
  countActiveCatalogFilters,
} from "./filters";
import { defaultCatalogSearchInput } from "./validation";

describe("catalog search URL state", () => {
  it("round-trips repeatable filters without defaults", () => {
    const input = {
      ...defaultCatalogSearchInput(),
      query: "news",
      genres: ["electronic", "cinematic"],
      underDialogue: true,
    };
    expect(catalogSearchInputToParams(input).toString()).toContain(
      "genre=electronic&genre=cinematic",
    );
    expect(countActiveCatalogFilters(input)).toBe(3);
  });

  it("resets page unless an explicit page link is requested", () => {
    const input = { ...defaultCatalogSearchInput(), page: 4 };
    expect(catalogLibraryHref(input)).toBe("/library");
    expect(catalogLibraryHref(input, (params) => params.set("page", "3"))).toBe(
      "/library?page=3",
    );
  });
});
