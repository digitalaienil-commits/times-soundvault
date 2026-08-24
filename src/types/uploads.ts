import type { ContentIdEligibility, RightsBasis } from "./domain/rights";

export const ACCEPTED_AUDIO_EXTENSIONS = [".wav", ".mp3"] as const;
export type AcceptedAudioExtension = (typeof ACCEPTED_AUDIO_EXTENSIONS)[number];

export const STEM_TYPES = [
  "vocals",
  "drums",
  "percussion",
  "indian_percussion",
  "bass",
  "melody",
  "harmony",
  "piano_keys",
  "guitars",
  "strings",
  "brass",
  "woodwinds",
  "synths",
  "pads",
  "choir",
  "ambience",
  "riser",
  "impacts",
  "fx",
  "other",
] as const;
export type StemType = (typeof STEM_TYPES)[number];

export const UPLOAD_STATUSES = [
  "created",
  "uploading",
  "paused",
  "completed",
  "failed",
  "cancelled",
  "expired",
] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];
export type StorageKind = "local" | "onedrive";

export const NEWS_FORMATS = [
  "background_bed",
  "stinger",
  "bumper",
  "intro",
  "outro",
  "transition",
  "theme",
  "full_track",
] as const;
export const EDITORIAL_USES = [
  "breaking_news",
  "general_news",
  "business",
  "markets",
  "politics",
  "elections",
  "crime",
  "investigation",
  "sports",
  "technology",
  "entertainment",
  "human_interest",
  "weather",
  "documentary",
  "promo",
  "patriotic",
  "festival",
] as const;

export interface PublicUploadConfig {
  acceptedExtensions: readonly AcceptedAudioExtension[];
  maxFileBytes: number;
  maxBatchBytes: number;
  maxTracksPerBatch: number;
  maxStemsPerTrack: number;
  concurrency: number;
  advisoryMaxDurationSeconds: number;
  storageDisplayLabel: string;
}

export interface UploadSessionDto {
  id: string;
  audioFileId: string;
  ownerUserId: string;
  storageBackend: StorageKind;
  status: UploadStatus;
  expectedByteSize: number;
  uploadedByteSize: number;
  rowVersion: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface UploadFileDraftInput {
  clientId: string;
  originalFilename: string;
  byteSize: number;
  claimedMime: string;
  extension: AcceptedAudioExtension;
  role: "master" | "stem";
  stemType?: StemType;
  customStemLabel?: string;
  sortOrder: number;
}

export interface ProducerMetadataInput {
  workingTitle: string;
  description?: string;
  producerNotes?: string;
  internalSourceReference?: string;
  format?: (typeof NEWS_FORMATS)[number];
  editorialUses?: (typeof EDITORIAL_USES)[number][];
  underDialogue?: "yes" | "no" | "unknown";
  loopable?: "yes" | "no" | "unknown";
  endingType?: "clean_stop" | "final_hit" | "fade" | "open" | "unknown";
}

export interface RightsDraftInput {
  masterRightsBasis: RightsBasis;
  masterOwnerName?: string;
  compositionRightsBasis: RightsBasis;
  compositionOwnerName?: string;
  publisherName?: string;
  territory?: string;
  validFrom?: string;
  validUntil?: string;
  sourceReference?: string;
  notes?: string;
  oneStopClearance?: boolean;
  contentIdEligibility?: ContentIdEligibility;
}

export interface TrackPackageDraftInput {
  clientId: string;
  workingTitle: string;
  files: UploadFileDraftInput[];
  producerMetadata: ProducerMetadataInput;
  rights: RightsDraftInput;
}

export interface CreateUploadBatchInput {
  idempotencyKey: string;
  label?: string;
  acknowledgementAccepted: boolean;
  packages: TrackPackageDraftInput[];
}

export interface CreatedUploadFile {
  clientId: string;
  submissionId: string;
  session: UploadSessionDto;
}

export interface CreatedUploadBatch {
  batchId: string;
  submissions: Array<{ submissionId: string; title: string }>;
  files: CreatedUploadFile[];
}

export interface UploadWorkspaceSubmission {
  id: string;
  batchId: string | null;
  batchLabel: string | null;
  ownerUserId: string;
  ownerName: string;
  status: string;
  revisionId: string;
  revisionNumber: number;
  title: string;
  producerMetadata: Record<string, unknown>;
  acknowledged: boolean;
  updatedAt: string;
  totalFiles: number;
  masterCount: number;
  stemCount: number;
  uploadedBytes: number;
  totalBytes: number;
  files: UploadWorkspaceFile[];
}

export interface UploadWorkspaceFile {
  audioFileId: string;
  sessionId: string;
  role: "master" | "stem";
  stemType: string | null;
  stemLabel: string | null;
  sortOrder: number;
  originalFilename: string;
  byteSize: number;
  contentType: string | null;
  containerFormat: string | null;
  technicalStatus: string;
  uploadStatus: UploadStatus;
  uploadedBytes: number;
}
