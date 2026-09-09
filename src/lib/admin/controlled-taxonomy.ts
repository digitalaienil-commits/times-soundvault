/**
 * The controlled taxonomy seeded by
 * `migrations/domain/0005-coordinator-review-workspace.sql`. This is required
 * configuration, not runtime data: keep it identical to the migration so a
 * cleaned local database and a freshly migrated database agree.
 */
export interface ControlledTaxonomyTerm {
  id: string;
  category: "format" | "use_case";
  slug: string;
  label: string;
}

export const CONTROLLED_TAXONOMY_TERMS: readonly ControlledTaxonomyTerm[] = [
  {
    id: "70000000-0000-4000-8000-000000000001",
    category: "format",
    slug: "background-bed",
    label: "Background Bed",
  },
  {
    id: "70000000-0000-4000-8000-000000000002",
    category: "format",
    slug: "stinger",
    label: "Stinger",
  },
  {
    id: "70000000-0000-4000-8000-000000000003",
    category: "format",
    slug: "bumper",
    label: "Bumper",
  },
  {
    id: "70000000-0000-4000-8000-000000000004",
    category: "format",
    slug: "intro",
    label: "Intro",
  },
  {
    id: "70000000-0000-4000-8000-000000000005",
    category: "format",
    slug: "outro",
    label: "Outro",
  },
  {
    id: "70000000-0000-4000-8000-000000000006",
    category: "format",
    slug: "transition",
    label: "Transition",
  },
  {
    id: "70000000-0000-4000-8000-000000000007",
    category: "format",
    slug: "theme",
    label: "Theme",
  },
  {
    id: "70000000-0000-4000-8000-000000000008",
    category: "format",
    slug: "full-track",
    label: "Full Track",
  },
  {
    id: "70000000-0000-4000-8000-000000000101",
    category: "use_case",
    slug: "breaking-news",
    label: "Breaking News",
  },
  {
    id: "70000000-0000-4000-8000-000000000102",
    category: "use_case",
    slug: "general-news",
    label: "General News",
  },
  {
    id: "70000000-0000-4000-8000-000000000103",
    category: "use_case",
    slug: "business",
    label: "Business",
  },
  {
    id: "70000000-0000-4000-8000-000000000104",
    category: "use_case",
    slug: "markets",
    label: "Markets",
  },
  {
    id: "70000000-0000-4000-8000-000000000105",
    category: "use_case",
    slug: "politics",
    label: "Politics",
  },
  {
    id: "70000000-0000-4000-8000-000000000106",
    category: "use_case",
    slug: "elections",
    label: "Elections",
  },
  {
    id: "70000000-0000-4000-8000-000000000107",
    category: "use_case",
    slug: "crime",
    label: "Crime",
  },
  {
    id: "70000000-0000-4000-8000-000000000108",
    category: "use_case",
    slug: "investigation",
    label: "Investigation",
  },
  {
    id: "70000000-0000-4000-8000-000000000109",
    category: "use_case",
    slug: "sports",
    label: "Sports",
  },
  {
    id: "70000000-0000-4000-8000-000000000110",
    category: "use_case",
    slug: "technology",
    label: "Technology",
  },
  {
    id: "70000000-0000-4000-8000-000000000111",
    category: "use_case",
    slug: "entertainment",
    label: "Entertainment",
  },
  {
    id: "70000000-0000-4000-8000-000000000112",
    category: "use_case",
    slug: "human-interest",
    label: "Human Interest",
  },
  {
    id: "70000000-0000-4000-8000-000000000113",
    category: "use_case",
    slug: "weather",
    label: "Weather",
  },
  {
    id: "70000000-0000-4000-8000-000000000114",
    category: "use_case",
    slug: "documentary",
    label: "Documentary",
  },
  {
    id: "70000000-0000-4000-8000-000000000115",
    category: "use_case",
    slug: "promo",
    label: "Promo",
  },
  {
    id: "70000000-0000-4000-8000-000000000116",
    category: "use_case",
    slug: "patriotic",
    label: "Patriotic",
  },
  {
    id: "70000000-0000-4000-8000-000000000117",
    category: "use_case",
    slug: "festival",
    label: "Festival",
  },
] as const;
