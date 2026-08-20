export const ASSET_KINDS = ["music", "sound_effect", "ambience"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const VERSION_TYPES = [
  "original",
  "alternate",
  "cutdown",
  "instrumental",
  "remix",
  "other",
] as const;
export type VersionType = (typeof VERSION_TYPES)[number];

export const PUBLICATION_STATUSES = [
  "unpublished",
  "published",
  "withdrawn",
  "archived",
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const TRACK_IDENTIFIER_TYPES = ["isrc", "legacy", "custom"] as const;
export type TrackIdentifierType = (typeof TRACK_IDENTIFIER_TYPES)[number];

export const COMPOSITION_IDENTIFIER_TYPES = [
  "iswc",
  "legacy",
  "custom",
] as const;
export type CompositionIdentifierType =
  (typeof COMPOSITION_IDENTIFIER_TYPES)[number];

export const ASSET_ROLES = ["master", "stem"] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const FILE_ROLES = ["source", "preview", "analysis_derivative"] as const;
export type FileRole = (typeof FILE_ROLES)[number];

export const TECHNICAL_STATUSES = [
  "registered",
  "uploading",
  "available",
  "failed",
  "quarantined",
] as const;
export type TechnicalStatus = (typeof TECHNICAL_STATUSES)[number];

export interface TrackDto {
  id: string;
  compositionId: string | null;
  parentTrackId: string | null;
  assetKind: AssetKind;
  title: string | null;
  description: string | null;
  versionType: VersionType;
  versionLabel: string | null;
  publicationStatus: PublicationStatus;
  publishedRevisionId: string | null;
  createdByUserId: string;
  publishedAt: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface AudioFileDto {
  id: string;
  audioAssetId: string;
  fileRole: FileRole;
  originalFilename: string;
  checksumSha256: string | null;
  technicalStatus: TechnicalStatus;
}

export interface AudioAssetDto {
  id: string;
  trackId: string;
  submissionRevisionId: string;
  assetRole: AssetRole;
  stemType: string | null;
  stemLabel: string | null;
  displayTitle: string | null;
  sortOrder: number;
  createdAt: string;
}
