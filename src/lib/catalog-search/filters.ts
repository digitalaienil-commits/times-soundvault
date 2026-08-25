import type { CatalogSearchInput } from "@/types/catalog-search";
import type { TaxonomyCategory } from "@/types/domain/metadata";

export const TAXONOMY_FILTERS = [
  { category: "use_case", input: "useCases", parameter: "useCase" },
  { category: "format", input: "formats", parameter: "format" },
  { category: "genre", input: "genres", parameter: "genre" },
  { category: "subgenre", input: "subgenres", parameter: "subgenre" },
  { category: "mood", input: "moods", parameter: "mood" },
  { category: "instrument", input: "instruments", parameter: "instrument" },
  { category: "theme", input: "themes", parameter: "theme" },
  { category: "festival", input: "festivals", parameter: "festival" },
  { category: "character", input: "characters", parameter: "character" },
  { category: "movement", input: "movements", parameter: "movement" },
  { category: "era", input: "eras", parameter: "era" },
  { category: "geo_genre", input: "geoGenres", parameter: "geoGenre" },
  {
    category: "geo_subgenre",
    input: "geoSubgenres",
    parameter: "geoSubgenre",
  },
] as const satisfies ReadonlyArray<{
  category: TaxonomyCategory;
  input: keyof CatalogSearchInput;
  parameter: string;
}>;

export function catalogSearchInputToParams(
  input: CatalogSearchInput,
): URLSearchParams {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.sort !== "relevance") params.set("sort", input.sort);
  if (input.page !== 1) params.set("page", String(input.page));
  if (input.pageSize !== 30) params.set("pageSize", String(input.pageSize));
  input.assetKinds.forEach((value) => params.append("type", value));
  input.versionTypes.forEach((value) => params.append("version", value));
  for (const filter of TAXONOMY_FILTERS) {
    const values = input[filter.input];
    if (Array.isArray(values)) {
      values.forEach((value) => params.append(filter.parameter, value));
    }
  }
  input.vocalStates.forEach((value) => params.append("vocal", value));
  input.endingTypes.forEach((value) => params.append("ending", value));
  if (input.bpmMin !== null) params.set("bpmMin", String(input.bpmMin));
  if (input.bpmMax !== null) params.set("bpmMax", String(input.bpmMax));
  if (input.durationMinSeconds !== null)
    params.set("durationMin", String(input.durationMinSeconds));
  if (input.durationMaxSeconds !== null)
    params.set("durationMax", String(input.durationMaxSeconds));
  if (input.keyTonic) params.set("key", input.keyTonic);
  if (input.keyMode) params.set("mode", input.keyMode);
  if (input.energyMin !== null)
    params.set("energyMin", String(Math.round(input.energyMin * 100)));
  if (input.energyMax !== null)
    params.set("energyMax", String(Math.round(input.energyMax * 100)));
  if (input.underDialogue !== null)
    params.set("underDialogue", input.underDialogue ? "yes" : "no");
  if (input.loopable !== null)
    params.set("loopable", input.loopable ? "yes" : "no");
  if (input.hasStems !== null)
    params.set("hasStems", input.hasStems ? "yes" : "no");
  if (input.publishedAfter) params.set("publishedAfter", input.publishedAfter);
  if (input.publishedBefore)
    params.set("publishedBefore", input.publishedBefore);
  return params;
}

export function catalogLibraryHref(
  input: CatalogSearchInput,
  mutate?: (params: URLSearchParams) => void,
): string {
  const params = catalogSearchInputToParams(input);
  params.delete("page");
  mutate?.(params);
  const query = params.toString();
  return query ? `/library?${query}` : "/library";
}

export function countActiveCatalogFilters(input: CatalogSearchInput): number {
  let count =
    input.assetKinds.length +
    input.versionTypes.length +
    input.vocalStates.length +
    input.endingTypes.length;
  for (const filter of TAXONOMY_FILTERS) {
    const values = input[filter.input];
    if (Array.isArray(values)) count += values.length;
  }
  count += [
    input.bpmMin,
    input.bpmMax,
    input.durationMinSeconds,
    input.durationMaxSeconds,
    input.keyTonic,
    input.keyMode,
    input.energyMin,
    input.energyMax,
    input.underDialogue,
    input.loopable,
    input.hasStems,
    input.publishedAfter,
    input.publishedBefore,
  ].filter((value) => value !== null).length;
  return count;
}
