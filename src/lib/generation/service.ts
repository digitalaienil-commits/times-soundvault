import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { hasPermission } from "@/lib/auth/permissions";
import { getDatabase } from "@/lib/database/database";
import { createStorageProvider } from "@/lib/storage/factory";
import type { GeneratedStoredObject } from "@/lib/storage/provider";
import type { CurrentUser } from "@/types/auth";
import type { AssetKind } from "@/types/domain/catalog";
import type { StorageKind } from "@/types/uploads";

import {
  getAvailableGenerationProviders,
  parseGenerationConfig,
} from "./config";
import { createMusicGenerationProvider } from "./factory";
import type { GenerationAssetKind, GenerationProviderKind } from "./provider";

export interface GenerateAudioInput {
  assetKind?: GenerationAssetKind;
  prompt: string;
  provider?: GenerationProviderKind;
  model?: string;
  durationSeconds?: number;
  instrumentalOnly?: boolean;
  tempoBpm?: number | null;
  genre?: string | null;
  seed?: number | null;
  loop?: boolean;
  promptInfluence?: number | null;
}

export interface ClientGenerationResponse {
  id: string;
  assetKind: GenerationAssetKind;
  audioDataUri: string;
  mimeType: "audio/wav" | "audio/mpeg";
  durationMs: number;
  provider: GenerationProviderKind;
  model: string;
  prompt: string;
  parameters: Record<string, unknown>;
  isSimulated: boolean;
  createdAt: string;
}

export interface SaveDraftSubmissionInput {
  generationId: string;
  workingTitle?: string;
}

interface GenerationRecordRow {
  id: string;
  actor_user_id: string;
  provider: GenerationProviderKind;
  model: string;
  prompt: string;
  parameters: Record<string, unknown>;
  output_duration_ms: number | string | null;
  is_simulated: boolean;
  status: "completed" | "draft_committed" | "failed";
  asset_kind: GenerationAssetKind;
  storage_backend: StorageKind | null;
  storage_key: string | null;
  provider_drive_id: string | null;
  provider_item_id: string | null;
  byte_size: number | string | null;
  checksum_sha256: string | null;
  content_type: "audio/wav" | "audio/mpeg" | null;
  container_format: "wav" | "mp3" | null;
}

export class GenerationServiceError extends Error {
  constructor(
    public readonly code:
      | "UNAUTHORIZED"
      | "VALIDATION_FAILED"
      | "STORAGE_FAILED"
      | "DATABASE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "GenerationServiceError";
  }
}

function assertGenerationAccess(user: CurrentUser, action: string) {
  if (!hasPermission(user.role, "generation.create")) {
    throw new GenerationServiceError(
      "UNAUTHORIZED",
      `You do not have permission to ${action}`,
    );
  }
}

function normalizeAssetKind(value: unknown): GenerationAssetKind {
  return value === "sound_effect" ? "sound_effect" : "music";
}

function validatePrompt(value: string, assetKind: GenerationAssetKind): string {
  const prompt = value.trim();
  if (!prompt) {
    throw new GenerationServiceError(
      "VALIDATION_FAILED",
      assetKind === "sound_effect"
        ? "A sound-effect prompt is required"
        : "A music prompt is required",
    );
  }
  if (prompt.length > 500) {
    throw new GenerationServiceError(
      "VALIDATION_FAILED",
      "Generation prompt must be 500 characters or fewer",
    );
  }
  return prompt;
}

function validateWorkingTitle(value: string | undefined): string | null {
  const title = value?.trim();
  if (!title) return null;
  if (title.length > 160) {
    throw new GenerationServiceError(
      "VALIDATION_FAILED",
      "Working title must be 160 characters or fewer",
    );
  }
  return title;
}

function assertProviderIsAvailable(
  provider: GenerationProviderKind,
  assetKind: GenerationAssetKind,
  model: string | undefined,
) {
  const config = parseGenerationConfig();
  const available = getAvailableGenerationProviders(config);
  const providerOption = available.find((item) => item.provider === provider);
  if (!providerOption || !providerOption.assetKinds.includes(assetKind)) {
    throw new GenerationServiceError(
      "VALIDATION_FAILED",
      "The selected generation provider is not configured for this asset type",
    );
  }

  const models = providerOption.models[assetKind] ?? [];
  const selectedModel = model ?? models[0]?.id;
  if (!selectedModel || !models.some((item) => item.id === selectedModel)) {
    throw new GenerationServiceError(
      "VALIDATION_FAILED",
      "The selected generation model is not available",
    );
  }

  return { config, selectedModel, providerOption };
}

function dataUri(
  mimeType: "audio/wav" | "audio/mpeg",
  audioBuffer: Buffer,
): string {
  return `data:${mimeType};base64,${audioBuffer.toString("base64")}`;
}

async function writeTemporaryAudioFile(
  id: string,
  extension: "wav" | "mp3",
  buffer: Buffer,
) {
  const tempDir = path.join(os.tmpdir(), "soundvault-generation", id);
  await mkdir(tempDir, { recursive: true, mode: 0o700 });
  const tempFilePath = path.join(tempDir, `${id}.${extension}`);
  await writeFile(tempFilePath, buffer, { mode: 0o600 });
  return { tempDir, tempFilePath };
}

async function persistGenerationPreview(params: {
  id: string;
  audioBuffer: Buffer;
  mimeType: "audio/wav" | "audio/mpeg";
  containerFormat: "wav" | "mp3";
}) {
  const storage = createStorageProvider();
  const { tempDir, tempFilePath } = await writeTemporaryAudioFile(
    params.id,
    params.containerFormat,
    params.audioBuffer,
  );
  try {
    return await storage.storeGeneratedObject({
      storageKey: `generated/previews/${params.id}.${params.containerFormat}`,
      sourcePath: tempFilePath,
      contentType: params.mimeType,
      expectedByteSize: params.audioBuffer.length,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function generateAudioDraft(
  user: CurrentUser,
  input: GenerateAudioInput,
): Promise<ClientGenerationResponse> {
  assertGenerationAccess(user, "generate audio");

  const assetKind = normalizeAssetKind(input.assetKind);
  const prompt = validatePrompt(input.prompt, assetKind);
  const requestedProvider = input.provider ?? "simulated";
  const { config, selectedModel, providerOption } = assertProviderIsAvailable(
    requestedProvider,
    assetKind,
    input.model,
  );
  const providerInstance = createMusicGenerationProvider(requestedProvider);
  const dryRun = config.dryRun || !providerOption.live;

  const result = await providerInstance.generate({
    assetKind,
    prompt,
    provider: requestedProvider,
    model: selectedModel,
    durationSeconds:
      input.durationSeconds ?? (assetKind === "sound_effect" ? 5 : 30),
    instrumentalOnly:
      assetKind === "music" ? (input.instrumentalOnly ?? true) : true,
    tempoBpm: assetKind === "music" ? (input.tempoBpm ?? null) : null,
    genre: assetKind === "music" ? (input.genre ?? null) : null,
    seed: input.seed ?? null,
    loop: assetKind === "sound_effect" ? (input.loop ?? false) : false,
    promptInfluence:
      assetKind === "sound_effect" ? (input.promptInfluence ?? 0.3) : null,
    dryRun,
  });

  const generationId = randomUUID();
  const checksum = createHash("sha256")
    .update(result.audioBuffer)
    .digest("hex");
  let stored: GeneratedStoredObject | null = null;
  try {
    stored = await persistGenerationPreview({
      id: generationId,
      audioBuffer: result.audioBuffer,
      mimeType: result.mimeType,
      containerFormat: result.containerFormat,
    });

    await getDatabase().query(
      `INSERT INTO workflow.ai_generation_record (
         id, actor_user_id, provider, model, model_version, prompt, parameters,
         output_duration_ms, output_format, is_simulated, status, asset_kind,
         storage_backend, storage_key, provider_drive_id, provider_item_id,
         byte_size, checksum_sha256, content_type, container_format
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, 'completed', $11,
         $12, $13, $14, $15,
         $16, $17, $18, $19
       )`,
      [
        generationId,
        user.id,
        result.provider,
        result.model,
        "v1",
        result.prompt,
        {
          ...result.parameters,
          providerRequestId: result.id,
        },
        result.durationMs,
        result.containerFormat,
        result.isSimulated,
        result.assetKind,
        stored.storageBackend,
        stored.storageKey,
        stored.providerDriveId ?? null,
        stored.providerItemId ?? null,
        result.audioBuffer.length,
        checksum,
        result.mimeType,
        result.containerFormat,
      ],
    );
  } catch (error) {
    if (stored) {
      await createStorageProvider().deleteGeneratedObject({
        storageKey: stored.storageKey,
        providerDriveId: stored.providerDriveId,
        providerItemId: stored.providerItemId,
      });
    }
    throw new GenerationServiceError(
      error instanceof GenerationServiceError ? error.code : "DATABASE_FAILED",
      error instanceof Error
        ? error.message
        : "Failed to persist generated audio",
    );
  }

  return {
    id: generationId,
    assetKind: result.assetKind,
    audioDataUri: dataUri(result.mimeType, result.audioBuffer),
    mimeType: result.mimeType,
    durationMs: result.durationMs,
    provider: result.provider,
    model: result.model,
    prompt: result.prompt,
    parameters: result.parameters,
    isSimulated: result.isSimulated,
    createdAt: result.createdAt.toISOString(),
  };
}

async function loadGenerationRecord(
  generationId: string,
  userId: string,
): Promise<GenerationRecordRow> {
  const record = await getDatabase().query<GenerationRecordRow>(
    `SELECT
       id, actor_user_id, provider, model, prompt, parameters,
       output_duration_ms, is_simulated, status, asset_kind, storage_backend,
       storage_key, provider_drive_id, provider_item_id, byte_size,
       checksum_sha256, content_type, container_format
     FROM workflow.ai_generation_record
     WHERE id = $1 AND actor_user_id = $2
     LIMIT 1`,
    [generationId, userId],
  );
  const row = record.rows[0];
  if (!row) {
    throw new GenerationServiceError(
      "VALIDATION_FAILED",
      "Generation result was not found for this user",
    );
  }
  if (row.status !== "completed") {
    throw new GenerationServiceError(
      "VALIDATION_FAILED",
      "Generation result has already been committed or is unavailable",
    );
  }
  if (
    !row.storage_backend ||
    !row.storage_key ||
    !row.byte_size ||
    !row.checksum_sha256 ||
    !row.content_type ||
    !row.container_format
  ) {
    throw new GenerationServiceError(
      "VALIDATION_FAILED",
      "Generation result is missing trusted stored audio",
    );
  }
  return row;
}

function defaultTitle(record: GenerationRecordRow) {
  const prefix =
    record.asset_kind === "sound_effect"
      ? "AI Generated SFX"
      : "AI Generated Music";
  return `${prefix} — ${record.prompt.slice(0, 40).trim()}`;
}

/**
 * Saves a server-owned generation result into private storage and creates an
 * unpublished draft Submission. The browser only supplies the generation ID.
 */
export async function saveGeneratedTrackAsDraft(
  user: CurrentUser,
  input: SaveDraftSubmissionInput,
): Promise<{ submissionId: string; trackId: string; revisionId: string }> {
  assertGenerationAccess(user, "create a submission from generated audio");

  const generationId = input.generationId?.trim();
  if (!generationId) {
    throw new GenerationServiceError(
      "VALIDATION_FAILED",
      "Generation result ID is required",
    );
  }

  const title = validateWorkingTitle(input.workingTitle);
  const record = await loadGenerationRecord(generationId, user.id);
  const expectedBytes = Number(record.byte_size);
  const audioFileId = randomUUID();
  const trackId = randomUUID();
  const submissionId = randomUUID();
  const revisionId = randomUUID();
  const assetId = randomUUID();
  const extension = record.container_format;
  const storageKey = `submissions/${submissionId}/revisions/1/${audioFileId}.${extension}`;
  const storage = createStorageProvider();
  const tempDir = path.join(
    os.tmpdir(),
    "soundvault-generation-commit",
    generationId,
  );
  const tempFilePath = path.join(tempDir, `${generationId}.${extension}`);
  let stored: GeneratedStoredObject | null = null;

  try {
    await mkdir(tempDir, { recursive: true, mode: 0o700 });
    await storage.materializeStoredObject({
      storageKey: record.storage_key!,
      providerDriveId: record.provider_drive_id,
      providerItemId: record.provider_item_id,
      destinationPath: tempFilePath,
    });
    const materialized = await stat(tempFilePath);
    if (materialized.size !== expectedBytes) {
      throw new GenerationServiceError(
        "STORAGE_FAILED",
        "Stored generation byte size does not match provenance",
      );
    }
    const audioBuffer = await readFile(tempFilePath);
    const checksum = createHash("sha256").update(audioBuffer).digest("hex");
    if (checksum !== record.checksum_sha256) {
      throw new GenerationServiceError(
        "STORAGE_FAILED",
        "Stored generation checksum does not match provenance",
      );
    }
    stored = await storage.storeGeneratedObject({
      storageKey,
      sourcePath: tempFilePath,
      contentType: record.content_type!,
      expectedByteSize: expectedBytes,
    });

    const pool = getDatabase();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO catalog.track (
           id, asset_kind, title, version_type, publication_status, created_by_user_id
         ) VALUES ($1, $2, $3, 'original', 'unpublished', $4)`,
        [
          trackId,
          record.asset_kind as AssetKind,
          title ?? defaultTitle(record),
          user.id,
        ],
      );

      await client.query(
        `INSERT INTO workflow.submission (
           id, track_id, owner_user_id, current_revision_id, latest_revision_number,
           status, draft_idempotency_key
         ) VALUES ($1, $2, $3, $4, 1, 'draft', $5)`,
        [submissionId, trackId, user.id, revisionId, `ai-gen:${generationId}`],
      );

      await client.query(
        `INSERT INTO workflow.submission_revision (
           id, submission_id, revision_number, created_by_user_id,
           revision_status, producer_metadata, source_notes
         ) VALUES ($1, $2, 1, $3, 'draft', $4, $5)`,
        [
          revisionId,
          submissionId,
          user.id,
          {
            aiGenerated: true,
            generationRecordId: record.id,
            assetKind: record.asset_kind,
            provider: record.provider,
            model: record.model,
            prompt: record.prompt,
            parameters: record.parameters,
            isSimulated: record.is_simulated,
          },
          `AI-generated ${record.asset_kind.replace("_", " ")} via ${record.provider} (${record.model}). Prompt: "${record.prompt}"`,
        ],
      );

      await client.query(
        `INSERT INTO catalog.audio_asset (
           id, track_id, submission_revision_id, asset_role, display_title, origin
         ) VALUES ($1, $2, $3, 'master', $4, 'ai_generated')`,
        [
          assetId,
          trackId,
          revisionId,
          record.asset_kind === "sound_effect"
            ? "Sound Effect Master"
            : "Master Audio",
        ],
      );

      await client.query(
        `INSERT INTO catalog.audio_file (
           id, audio_asset_id, file_role, original_filename, storage_backend,
           storage_key, content_type, container_format, byte_size,
           checksum_sha256, duration_ms, technical_status
         ) VALUES ($1, $2, 'source', $3, $4, $5, $6, $7, $8, $9, $10, 'available')`,
        [
          audioFileId,
          assetId,
          `generated-${record.model}.${extension}`,
          stored.storageBackend,
          stored.storageKey,
          record.content_type,
          record.container_format,
          expectedBytes,
          checksum,
          Number(record.output_duration_ms ?? 0),
        ],
      );

      const updated = await client.query(
        `UPDATE workflow.ai_generation_record
         SET status = 'draft_committed',
             output_audio_file_id = $1,
             created_submission_id = $2,
             created_revision_id = $3,
             committed_at = now(),
             committed_by_user_id = $4
         WHERE id = $5
           AND actor_user_id = $4
           AND status = 'completed'
           AND created_submission_id IS NULL`,
        [audioFileId, submissionId, revisionId, user.id, generationId],
      );
      if ((updated.rowCount ?? 0) !== 1) {
        throw new GenerationServiceError(
          "VALIDATION_FAILED",
          "Generation result has already been committed",
        );
      }

      await client.query(
        `INSERT INTO workflow.submission_event (
           id, submission_id, submission_revision_id, actor_user_id,
           event_type, to_status, event_metadata
         ) VALUES ($1, $2, $3, $4, 'created', 'draft', $5)`,
        [
          randomUUID(),
          submissionId,
          revisionId,
          user.id,
          {
            origin: "ai_generated",
            generationRecordId: record.id,
            provider: record.provider,
            model: record.model,
          },
        ],
      );

      await client.query("COMMIT");
      return { submissionId, trackId, revisionId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (stored) {
      await storage.deleteGeneratedObject({
        storageKey: stored.storageKey,
        providerDriveId: stored.providerDriveId,
        providerItemId: stored.providerItemId,
      });
    }
    throw new GenerationServiceError(
      error instanceof GenerationServiceError ? error.code : "DATABASE_FAILED",
      error instanceof Error
        ? error.message
        : "Failed to persist draft submission",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
