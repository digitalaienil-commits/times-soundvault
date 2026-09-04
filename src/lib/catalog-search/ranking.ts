export const CATALOG_SEARCH_RANKING = {
  exactTitle: 12,
  exactIdentifier: 11,
  titlePrefix: 7,
  titleSubstring: 3,
  coverDensityMultiplier: 5,
  titleSimilarityMultiplier: 2,
  trigramMinimumLength: 3,
  hybridLexicalWeight: 0.6,
  hybridSemanticWeight: 0.4,
  semanticDistanceThreshold: 0.5,
} as const;

export const CATALOG_SEARCH_WEIGHTS = {
  A: "Title and safe Track identifiers",
  B: "Accepted active taxonomy labels",
  C: "Canonical description, caption, version, era and language",
} as const;
