import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { hasPermission } from "@/lib/auth/permissions";
import { getDatabase } from "@/lib/database/database";
import { createStorageProvider } from "@/lib/storage/factory";
import type { CurrentUser } from "@/types/auth";

import { parseGenerationConfig } from "./config";
import { createMusicGenerationProvider } from "./factory";

export interface GenerateMusicInput {
  prompt: string;
  provider?: "google_lyria" | "elevenlabs" | "simulated";
  model?: string;
  durationSeconds?: number;
  instrumentalOnly?: boolean;
  tempoBpm?: number | null;
  genre?: string | null;
  seed?: number | null;
  dryRun?: boolean;
}

export interface ClientGenerationResponse {
  id: string;
  audioDataUri: string;
  mimeType: string;
  durationMs: number;
  provider: string;
  model: string;
  prompt: string;
  parameters: Record<string, unknown>;
  isSimulated: boolean;
  createdAt: string;
}

export interface SaveDraftSubmissionInput {
  audioBase64: string;
  mimeType: "audio/wav" | "audio/mpeg";
  containerFormat: "wav" | "mp3";
  durationMs: number;
  provider: string;
  model: string;
  prompt: string;
  parameters: Record<string, unknown>;
  isSimulated: boolean;
  workingTitle?: string;
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

/**
 * Validates role permission and generates a music track.
 * Returns safe client DTO with audio data URI and provenance.
 */
export async function generateMusicTrack(
  user: CurrentUser,
  input: GenerateMusicInput,
): Promise<ClientGenerationResponse> {
  if (!hasPermission(user.role, "generation.create")) {
    throw new GenerationServiceError(
      "UNAUTHORIZED",
      "You do not have permission to generate music",
    );
  }

  const prompt = input.prompt?.trim();
  if (!prompt) {
    throw new GenerationServiceError(
      "VALIDATION_FAILED",
      "A music prompt is required",
    );
  }

  const config = parseGenerationConfig();
  const providerInstance = createMusicGenerationProvider(input.provider);

  // Forced dry-run if global DRY_RUN is active or requested
  const dryRun = config.dryRun || input.dryRun === true;

  const result = await providerInstance.generate({
    prompt,
    provider: input.provider ?? config.provider,
    model: input.model ?? providerInstance.supportedModels[0]!,
    durationSeconds: input.durationSeconds ?? 30,
    instrumentalOnly: input.instrumentalOnly ?? true,
    tempoBpm: input.tempoBpm ?? null,
    genre: input.genre ?? null,
    seed: input.seed ?? null,
    dryRun,
  });

  const base64 = result.audioBuffer.toString("base64");
  const audioDataUri = `data:${result.mimeType};base64,${base64}`;

  return {
    id: result.id,
    audioDataUri,
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

/**
 * Saves generated audio into private storage and creates an unpublished draft Submission.
 * Strictly guarantees that the resulting track remains unpublished and enters the standard workflow.
 */
export async function saveGeneratedTrackAsDraft(
  user: CurrentUser,
  input: SaveDraftSubmissionInput,
): Promise<{ submissionId: string; trackId: string; revisionId: string }> {
  if (!hasPermission(user.role, "generation.create")) {
    throw new GenerationServiceError(
      "UNAUTHORIZED",
      "You do not have permission to create a submission from generated music",
    );
  }

  const audioBuffer = Buffer.from(input.audioBase64, "base64");
  if (audioBuffer.length === 0) {
    throw new GenerationServiceError(
      "VALIDATION_FAILED",
      "Generated audio data is empty",
    );
  }

  const sha256 = createHash("sha256").update(audioBuffer).digest("hex");
  const byteSize = audioBuffer.length;
  const audioFileId = randomUUID();
  const trackId = randomUUID();
  const submissionId = randomUUID();
  const revisionId = randomUUID();
  const assetId = randomUUID();

  const title =
    input.workingTitle?.trim() ||
    `AI Generated — ${input.prompt.slice(0, 40).trim()}`;
  const extension = input.containerFormat;
  const storageKey = `submissions/${submissionId}/revisions/1/${audioFileId}.${extension}`;

  // Write to temporary path for storage materialize / storeGeneratedObject
  const tempDir = path.join(os.tmpdir(), "soundvault-gen");
  await mkdir(tempDir, { recursive: true });
  const tempFilePath = path.join(tempDir, `${audioFileId}.${extension}`);
  await writeFile(tempFilePath, audioBuffer);

  const storage = createStorageProvider();
  let stored;
  try {
    stored = await storage.storeGeneratedObject({
      storageKey,
      sourcePath: tempFilePath,
      contentType: input.mimeType,
      expectedByteSize: byteSize,
    });
  } finally {
    await rm(tempFilePath, { force: true });
  }

  // Atomic database persistence: draft Track, draft Submission, Revision, Master Asset, Audio File, AI Provenance
  const pool = getDatabase();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Catalog Track (strictly publication_status = 'unpublished')
    await client.query(
      `INSERT INTO catalog.track (
         id, asset_kind, title, version_type, publication_status, created_by_user_id
       ) VALUES ($1, 'music', $2, 'original', 'unpublished', $3)`,
      [trackId, title, user.id],
    );

    // 2. Workflow Submission (strictly status = 'draft')
    await client.query(
      `INSERT INTO workflow.submission (
         id, track_id, owner_user_id, current_revision_id, latest_revision_number,
         status, draft_idempotency_key
       ) VALUES ($1, $2, $3, $4, 1, 'draft', $5)`,
      [submissionId, trackId, user.id, revisionId, `ai-gen:${audioFileId}`],
    );

    // 3. Workflow Revision (revision_status = 'draft')
    const producerMetadata = {
      aiGenerated: true,
      provider: input.provider,
      model: input.model,
      prompt: input.prompt,
      parameters: input.parameters,
      isSimulated: input.isSimulated,
    };
    const sourceNotes = `AI-generated via ${input.provider} (${input.model}). Prompt: "${input.prompt}"`;

    await client.query(
      `INSERT INTO workflow.submission_revision (
         id, submission_id, revision_number, created_by_user_id, revision_status,
         producer_metadata, source_notes
       ) VALUES ($1, $2, 1, $3, 'draft', $4, $5)`,
      [revisionId, submissionId, user.id, producerMetadata, sourceNotes],
    );

    // 4. Catalog Audio Asset (role = 'master')
    await client.query(
      `INSERT INTO catalog.audio_asset (
         id, track_id, submission_revision_id, asset_role, display_title
       ) VALUES ($1, $2, $3, 'master', 'Master Audio')`,
      [assetId, trackId, revisionId],
    );

    // 5. Catalog Audio File
    await client.query(
      `INSERT INTO catalog.audio_file (
         id, audio_asset_id, file_role, original_filename, storage_backend,
         storage_key, content_type, container_format, byte_size,
         checksum_sha256, duration_ms, technical_status
       ) VALUES ($1, $2, 'source', $3, $4, $5, $6, $7, $8, $9, $10, 'available')`,
      [
        audioFileId,
        assetId,
        `generated-${input.model}.${extension}`,
        stored.storageBackend,
        stored.storageKey,
        input.mimeType,
        input.containerFormat,
        byteSize,
        sha256,
        input.durationMs,
      ],
    );

    // 6. Workflow AI Generation Record (full immutable provenance)
    await client.query(
      `INSERT INTO workflow.ai_generation_record (
         id, actor_user_id, provider, model, prompt, parameters,
         output_audio_file_id, output_duration_ms, output_format,
         is_simulated, created_submission_id, created_revision_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        randomUUID(),
        user.id,
        input.provider,
        input.model,
        input.prompt,
        input.parameters,
        audioFileId,
        input.durationMs,
        input.containerFormat,
        input.isSimulated,
        submissionId,
        revisionId,
      ],
    );

    // 7. Workflow Submission Event
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
          origin: "ai_generation",
          provider: input.provider,
          model: input.model,
        },
      ],
    );

    await client.query("COMMIT");
    return { submissionId, trackId, revisionId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw new GenerationServiceError(
      "DATABASE_FAILED",
      error instanceof Error
        ? error.message
        : "Failed to persist draft submission",
    );
  } finally {
    client.release();
  }
}
