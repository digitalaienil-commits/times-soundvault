import type { AssetKind, VersionType } from "./domain/catalog";
import type {
  EndingType,
  TaxonomyCategory,
  VocalState,
} from "./domain/metadata";

export const CATALOG_SORTS = [
  "relevance",
  "newest",
  "oldest",
  "title_asc",
  "shortest",
  "longest",
  "bpm_asc",
  "bpm_desc",
] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export interface CatalogSearchInput {
  query: string;
  sort: CatalogSort;
  page: number;
  pageSize: number;
  assetKinds: AssetKind[];
  versionTypes: VersionType[];
  formats: string[];
  useCases: string[];
  genres: string[];
  subgenres: string[];
  moods: string[];
  instruments: string[];
  themes: string[];
  festivals: string[];
  characters: string[];
  movements: string[];
  eras: string[];
  geoGenres: string[];
  geoSubgenres: string[];
  vocalStates: Exclude<VocalState, "unknown">[];
  bpmMin: number | null;
  bpmMax: number | null;
  durationMinSeconds: number | null;
  durationMaxSeconds: number | null;
  keyTonic: string | null;
  keyMode: "major" | "minor" | null;
  energyMin: number | null;
  energyMax: number | null;
  underDialogue: boolean | null;
  loopable: boolean | null;
  endingTypes: Exclude<EndingType, "unknown">[];
  hasStems: boolean | null;
  publishedAfter: string | null;
  publishedBefore: string | null;
}

export interface CatalogDisplayTerm {
  category: TaxonomyCategory;
  slug: string;
  label: string;
}

export interface CatalogSearchItem {
  trackId: string;
  publishedRevisionId: string;
  title: string;
  description: string | null;
  descriptionCaption: string | null;
  assetKind: AssetKind;
  versionType: VersionType;
  versionLabel: string | null;
  publishedAt: string;
  durationMs: number | null;
  bpm: number | null;
  keyTonic: string | null;
  keyMode: string | null;
  energyScore: number | null;
  vocalState: VocalState;
  languageCode: string | null;
  underDialogue: boolean | null;
  loopable: boolean | null;
  endingType: EndingType | null;
  stemCount: number;
  terms: CatalogDisplayTerm[];
  relevance: number;
}

export interface CatalogFacetOption {
  slug: string;
  label: string;
  count: number | null;
}

export interface CatalogFacetGroup {
  category: TaxonomyCategory;
  label: string;
  options: CatalogFacetOption[];
}

export interface CatalogSearchResult {
  input: CatalogSearchInput;
  items: CatalogSearchItem[];
  total: number;
  pageCount: number;
  facets: CatalogFacetGroup[];
  queryMessage: string | null;
}

export interface PublishedMasterTechnicalSummary {
  durationMs: number | null;
  containerFormat: string | null;
  codec: string | null;
  sampleRateHz: number | null;
  bitDepth: number | null;
  channels: number | null;
  channelLayout: string | null;
  integratedLoudnessLufs: number | null;
  truePeakDbtp: number | null;
}

export interface PublishedStemSummary {
  stemType: string;
  label: string | null;
}

export interface PublishedTrackDetail extends Omit<
  CatalogSearchItem,
  "relevance" | "stemCount"
> {
  timeSignature: string | null;
  era: string | null;
  valence: number | null;
  arousal: number | null;
  identifiers: Array<{ type: string; value: string }>;
  stems: PublishedStemSummary[];
  masterTechnical: PublishedMasterTechnicalSummary;
}
