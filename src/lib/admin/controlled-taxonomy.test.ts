import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CONTROLLED_TAXONOMY_TERMS } from "./controlled-taxonomy";

const MIGRATION = path.join(
  process.cwd(),
  "migrations/domain/0005-coordinator-review-workspace.sql",
);

function readSeededTerms() {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf(
    "INSERT INTO catalog.taxonomy_term (id, category, slug, label)",
  );
  const seed = sql.slice(start, sql.indexOf("ON CONFLICT", start));
  return [
    ...seed.matchAll(/\('([^']+)', '([^']+)', '([^']+)', '([^']+)'\)/g),
  ].map(([, id, category, slug, label]) => ({ id, category, slug, label }));
}

describe("controlled taxonomy", () => {
  it("matches the taxonomy seeded by the domain migration", () => {
    expect(CONTROLLED_TAXONOMY_TERMS).toEqual(readSeededTerms());
  });

  it("uses unique identifiers and category/slug pairs", () => {
    const ids = new Set(CONTROLLED_TAXONOMY_TERMS.map((term) => term.id));
    const pairs = new Set(
      CONTROLLED_TAXONOMY_TERMS.map((term) => `${term.category}/${term.slug}`),
    );
    expect(ids.size).toBe(CONTROLLED_TAXONOMY_TERMS.length);
    expect(pairs.size).toBe(CONTROLLED_TAXONOMY_TERMS.length);
  });
});
