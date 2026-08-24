import "server-only";

import type { AcceptedAudioExtension, StorageKind } from "@/types/uploads";

export interface CreateStorageUploadInput {
  sessionId: string;
  submissionId: string;
  revisionNumber: number;
  audioFileId: string;
  extension: AcceptedAudioExtension;
  expectedByteSize: number;
}

export interface StorageUploadSessionReference {
  sessionId: string;
  storageKey: string;
  uploadUrl?: string;
  driveId?: string;
  itemId?: string;
  expiresAt?: string;
}

export interface StorageUploadSession {
  reference: StorageUploadSessionReference;
  uploadedByteSize: number;
}

export interface StorageUploadStatus {
  uploadedByteSize: number;
  completed: boolean;
  nextExpectedRanges?: string[];
  expired?: boolean;
}

export interface StoredObject {
  storageBackend: StorageKind;
  storageKey: string;
  byteSize: number;
  contentType: "audio/wav" | "audio/mpeg";
  containerFormat: "wav" | "mp3";
  providerDriveId?: string;
  providerItemId?: string;
}

export interface WriteStorageChunkInput {
  reference: StorageUploadSessionReference;
  body: ReadableStream<Uint8Array>;
  start: number;
  end: number;
  total: number;
}

export interface VerifyCompletedUploadInput {
  reference: StorageUploadSessionReference;
  expectedByteSize: number;
  extension: AcceptedAudioExtension;
}

export interface DeleteDraftObjectInput {
  reference: StorageUploadSessionReference;
}

export interface StorageProvider {
  readonly kind: StorageKind;
  createUploadSession(
    input: CreateStorageUploadInput,
  ): Promise<StorageUploadSession>;
  getUploadStatus(
    reference: StorageUploadSessionReference,
  ): Promise<StorageUploadStatus>;
  writeChunk(input: WriteStorageChunkInput): Promise<StorageUploadStatus>;
  abortUpload(reference: StorageUploadSessionReference): Promise<void>;
  verifyCompletedUpload(
    input: VerifyCompletedUploadInput,
  ): Promise<StoredObject>;
  deleteDraftObject(input: DeleteDraftObjectInput): Promise<void>;
}

export class StorageProviderError extends Error {
  constructor(
    public readonly code:
      | "INVALID_RANGE"
      | "INVALID_SIGNATURE"
      | "SIZE_MISMATCH"
      | "SESSION_EXPIRED"
      | "STORAGE_CONFLICT"
      | "PROVIDER_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "StorageProviderError";
  }
}
