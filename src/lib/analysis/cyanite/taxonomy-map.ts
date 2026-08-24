export interface TaxonomyMapping {
  category:
    "genre" | "subgenre" | "mood" | "instrument" | "character" | "movement";
  slug: string;
}

const mappings: Record<string, TaxonomyMapping> = {
  indian: { category: "genre", slug: "indian" },
  ambient: { category: "genre", slug: "ambient" },
  classical: { category: "genre", slug: "classical" },
  "electronic dance": { category: "genre", slug: "electronic-dance" },
  soundtrack: { category: "genre", slug: "soundtrack" },
  "spoken word": { category: "genre", slug: "spoken-word" },
  energetic: { category: "mood", slug: "energetic" },
  tense: { category: "mood", slug: "tense" },
  uplifting: { category: "mood", slug: "uplifting" },
  calm: { category: "mood", slug: "calm" },
  dark: { category: "mood", slug: "dark" },
  tabla: { category: "instrument", slug: "tabla" },
  sitar: { category: "instrument", slug: "sitar" },
  percussion: { category: "instrument", slug: "percussion" },
  strings: { category: "instrument", slug: "strings" },
  brass: { category: "instrument", slug: "brass" },
  woodwinds: { category: "instrument", slug: "woodwinds" },
  powerful: { category: "character", slug: "powerful" },
  mysterious: { category: "character", slug: "mysterious" },
};

export function mapCyaniteTaxonomyLabel(label: string): TaxonomyMapping | null {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return mappings[normalized] ?? null;
}
