export const VOCAL_STATES = [
  "unknown",
  "instrumental",
  "vocal",
  "mixed",
] as const;
export type VocalState = (typeof VOCAL_STATES)[number];

export const ENDING_TYPES = [
  "clean_stop",
  "final_hit",
  "fade",
  "open",
  "unknown",
] as const;
export type EndingType = (typeof ENDING_TYPES)[number];

export const TAXONOMY_CATEGORIES = [
  "genre",
  "subgenre",
  "mood",
  "instrument",
  "theme",
  "festival",
  "use_case",
  "character",
  "movement",
  "era",
  "format",
  "geo_genre",
  "geo_subgenre",
] as const;
export type TaxonomyCategory = (typeof TAXONOMY_CATEGORIES)[number];

export const METADATA_SOURCE_KINDS = [
  "producer",
  "embedded",
  "ai",
  "coordinator",
  "system",
] as const;
export type MetadataSourceKind = (typeof METADATA_SOURCE_KINDS)[number];

export const METADATA_ANALYSIS_STATUSES = [
  "not_started",
  "queued",
  "processing",
  "completed",
  "failed",
] as const;
export type MetadataAnalysisStatus =
  (typeof METADATA_ANALYSIS_STATUSES)[number];

export const COPYRIGHT_STATUSES = [
  "not_started",
  "queued",
  "checking",
  "claim_found",
  "conflict",
  "manual_review",
  "resolved",
  "failed",
] as const;
export type CopyrightStatus = (typeof COPYRIGHT_STATUSES)[number];

export interface TrackMetadataDto {
  trackId: string;
  bpm: number | null;
  keyTonic: string | null;
  keyMode: string | null;
  timeSignature: string | null;
  energyScore: number | null;
  valence: number | null;
  arousal: number | null;
  vocalState: VocalState;
  languageCode: string | null;
  era: string | null;
  descriptionCaption: string | null;
  underDialogue: boolean | null;
  loopable: boolean | null;
  endingType: EndingType | null;
  metadataVersion: number;
  updatedAt: string;
}
