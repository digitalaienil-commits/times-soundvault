ALTER TABLE catalog.audio_asset
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'human_uploaded';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audio_asset_origin_check'
  ) THEN
    ALTER TABLE catalog.audio_asset
      ADD CONSTRAINT audio_asset_origin_check
      CHECK (origin IN ('human_uploaded', 'ai_generated'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS audio_asset_origin_idx
  ON catalog.audio_asset (origin, created_at);

ALTER TABLE workflow.ai_generation_record
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS asset_kind TEXT NOT NULL DEFAULT 'music',
  ADD COLUMN IF NOT EXISTS storage_backend TEXT,
  ADD COLUMN IF NOT EXISTS storage_key TEXT,
  ADD COLUMN IF NOT EXISTS provider_drive_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_item_id TEXT,
  ADD COLUMN IF NOT EXISTS byte_size BIGINT,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS container_format TEXT,
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS committed_by_user_id TEXT REFERENCES auth."user"(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_generation_record_status_check'
  ) THEN
    ALTER TABLE workflow.ai_generation_record
      ADD CONSTRAINT ai_generation_record_status_check
      CHECK (status IN ('completed', 'draft_committed', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_generation_record_asset_kind_check'
  ) THEN
    ALTER TABLE workflow.ai_generation_record
      ADD CONSTRAINT ai_generation_record_asset_kind_check
      CHECK (asset_kind IN ('music', 'sound_effect'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_generation_record_storage_shape_check'
  ) THEN
    ALTER TABLE workflow.ai_generation_record
      ADD CONSTRAINT ai_generation_record_storage_shape_check
      CHECK (
        storage_key IS NULL
        OR (
          storage_backend IN ('local', 'onedrive')
          AND content_type IN ('audio/wav', 'audio/mpeg')
          AND container_format IN ('wav', 'mp3')
          AND byte_size IS NOT NULL
          AND byte_size > 0
          AND checksum_sha256 ~ '^[0-9a-f]{64}$'
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ai_generation_record_status_idx
  ON workflow.ai_generation_record (status, actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_generation_record_storage_idx
  ON workflow.ai_generation_record (storage_backend, storage_key)
  WHERE storage_key IS NOT NULL;
