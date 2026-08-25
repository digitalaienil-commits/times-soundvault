import {
  ASSET_KINDS,
  ASSET_ROLES,
  FILE_ROLES,
  PUBLICATION_STATUSES,
  TECHNICAL_STATUSES,
  VERSION_TYPES,
} from "@/types/domain/catalog";
import type {
  AudioAssetDto,
  AudioFileDto,
  TrackDto,
} from "@/types/domain/catalog";
import { ENDING_TYPES, VOCAL_STATES } from "@/types/domain/metadata";
import type { TrackMetadataDto } from "@/types/domain/metadata";

import {
  DomainRecordError,
  toIsoString,
  toNullableIsoString,
  toNullableNumber,
  toNumber,
} from "../record-mapping";

function includes<const Values extends readonly string[]>(
  values: Values,
  value: string,
): value is Values[number] {
  return values.includes(value);
}

export interface TrackRow {
  id: string;
  composition_id: string | null;
  parent_track_id: string | null;
  asset_kind: string;
  title: string | null;
  description: string | null;
  version_type: string;
  version_label: string | null;
  publication_status: string;
  published_revision_id: string | null;
  created_by_user_id: string;
  published_at: Date | string | null;
  row_version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapTrackRow(row: TrackRow): TrackDto {
  if (
    !includes(ASSET_KINDS, row.asset_kind) ||
    !includes(VERSION_TYPES, row.version_type) ||
    !includes(PUBLICATION_STATUSES, row.publication_status)
  ) {
    throw new DomainRecordError(
      "Track record contains an invalid domain value",
    );
  }
  return {
    id: row.id,
    compositionId: row.composition_id,
    parentTrackId: row.parent_track_id,
    assetKind: row.asset_kind,
    title: row.title,
    description: row.description,
    versionType: row.version_type,
    versionLabel: row.version_label,
    publicationStatus: row.publication_status,
    publishedRevisionId: row.published_revision_id,
    createdByUserId: row.created_by_user_id,
    publishedAt: toNullableIsoString(row.published_at),
    rowVersion: toNumber(row.row_version),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export interface AudioAssetRow {
  id: string;
  track_id: string;
  submission_revision_id: string;
  asset_role: string;
  stem_type: string | null;
  stem_label: string | null;
  display_title: string | null;
  sort_order: number;
  created_at: Date | string;
}

export function mapAudioAssetRow(row: AudioAssetRow): AudioAssetDto {
  if (!includes(ASSET_ROLES, row.asset_role)) {
    throw new DomainRecordError("Audio Asset contains an invalid role");
  }
  return {
    id: row.id,
    trackId: row.track_id,
    submissionRevisionId: row.submission_revision_id,
    assetRole: row.asset_role,
    stemType: row.stem_type,
    stemLabel: row.stem_label,
    displayTitle: row.display_title,
    sortOrder: row.sort_order,
    createdAt: toIsoString(row.created_at),
  };
}

export interface AudioFileRow {
  id: string;
  audio_asset_id: string;
  file_role: string;
  original_filename: string;
  checksum_sha256: string | null;
  technical_status: string;
}

export function mapAudioFileRow(row: AudioFileRow): AudioFileDto {
  if (
    !includes(FILE_ROLES, row.file_role) ||
    !includes(TECHNICAL_STATUSES, row.technical_status)
  ) {
    throw new DomainRecordError("Audio File contains an invalid domain value");
  }
  return {
    id: row.id,
    audioAssetId: row.audio_asset_id,
    fileRole: row.file_role,
    originalFilename: row.original_filename,
    checksumSha256: row.checksum_sha256,
    technicalStatus: row.technical_status,
  };
}

export interface TrackMetadataRow {
  track_id: string;
  bpm: number | string | null;
  key_tonic: string | null;
  key_mode: string | null;
  time_signature: string | null;
  energy_score: number | string | null;
  valence: number | string | null;
  arousal: number | string | null;
  vocal_state: string;
  language_code: string | null;
  era: string | null;
  description_caption: string | null;
  under_dialogue: boolean | null;
  loopable: boolean | null;
  ending_type: string | null;
  metadata_version: number | string;
  updated_at: Date | string;
}

export function mapTrackMetadataRow(row: TrackMetadataRow): TrackMetadataDto {
  if (
    !includes(VOCAL_STATES, row.vocal_state) ||
    (row.ending_type !== null && !includes(ENDING_TYPES, row.ending_type))
  ) {
    throw new DomainRecordError(
      "Track metadata contains an invalid vocal state",
    );
  }
  return {
    trackId: row.track_id,
    bpm: toNullableNumber(row.bpm),
    keyTonic: row.key_tonic,
    keyMode: row.key_mode,
    timeSignature: row.time_signature,
    energyScore: toNullableNumber(row.energy_score),
    valence: toNullableNumber(row.valence),
    arousal: toNullableNumber(row.arousal),
    vocalState: row.vocal_state,
    languageCode: row.language_code,
    era: row.era,
    descriptionCaption: row.description_caption,
    underDialogue: row.under_dialogue,
    loopable: row.loopable,
    endingType: row.ending_type,
    metadataVersion: toNumber(row.metadata_version),
    updatedAt: toIsoString(row.updated_at),
  };
}
