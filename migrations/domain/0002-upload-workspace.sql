ALTER TABLE workflow.submission_batch
  ADD COLUMN idempotency_key TEXT,
  ADD CONSTRAINT submission_batch_owner_idempotency_unique
    UNIQUE (created_by_user_id, idempotency_key),
  ADD CONSTRAINT submission_batch_idempotency_key_check
    CHECK (idempotency_key IS NULL OR trim(idempotency_key) <> '');

ALTER TABLE workflow.submission
  ADD COLUMN draft_idempotency_key TEXT,
  ADD CONSTRAINT submission_owner_draft_idempotency_unique
    UNIQUE (owner_user_id, draft_idempotency_key),
  ADD CONSTRAINT submission_draft_idempotency_key_check
    CHECK (draft_idempotency_key IS NULL OR trim(draft_idempotency_key) <> '');

CREATE TABLE workflow.upload_session (
  id UUID PRIMARY KEY,
  audio_file_id UUID NOT NULL UNIQUE REFERENCES catalog.audio_file(id),
  owner_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  storage_backend TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  expected_byte_size BIGINT NOT NULL,
  uploaded_byte_size BIGINT NOT NULL DEFAULT 0,
  provider_session_ciphertext TEXT,
  provider_session_nonce TEXT,
  provider_session_auth_tag TEXT,
  provider_key_version INTEGER,
  provider_item_id TEXT,
  provider_drive_id TEXT,
  provider_expiration TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL,
  last_error_code TEXT,
  last_error_message TEXT,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT upload_session_storage_backend_check
    CHECK (storage_backend IN ('local', 'onedrive')),
  CONSTRAINT upload_session_status_check
    CHECK (status IN ('created', 'uploading', 'paused', 'completed', 'failed', 'cancelled', 'expired')),
  CONSTRAINT upload_session_expected_size_check CHECK (expected_byte_size > 0),
  CONSTRAINT upload_session_uploaded_size_check CHECK (
    uploaded_byte_size >= 0 AND uploaded_byte_size <= expected_byte_size
  ),
  CONSTRAINT upload_session_idempotency_key_check CHECK (trim(idempotency_key) <> ''),
  CONSTRAINT upload_session_row_version_check CHECK (row_version > 0),
  CONSTRAINT upload_session_completed_timestamp_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT upload_session_cancelled_timestamp_check CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled' AND cancelled_at IS NULL)
  ),
  CONSTRAINT upload_session_provider_cipher_shape_check CHECK (
    (provider_session_ciphertext IS NULL
      AND provider_session_nonce IS NULL
      AND provider_session_auth_tag IS NULL
      AND provider_key_version IS NULL)
    OR
    (provider_session_ciphertext IS NOT NULL
      AND provider_session_nonce IS NOT NULL
      AND provider_session_auth_tag IS NOT NULL
      AND provider_key_version IS NOT NULL
      AND provider_key_version > 0)
  ),
  CONSTRAINT upload_session_owner_idempotency_unique
    UNIQUE (owner_user_id, idempotency_key)
);

CREATE INDEX upload_session_owner_status_idx
  ON workflow.upload_session (owner_user_id, status, updated_at DESC);
CREATE INDEX upload_session_expiry_idx
  ON workflow.upload_session (provider_expiration)
  WHERE provider_expiration IS NOT NULL;
CREATE INDEX upload_session_audio_file_idx
  ON workflow.upload_session (audio_file_id);
CREATE INDEX upload_session_incomplete_idx
  ON workflow.upload_session (updated_at)
  WHERE status IN ('created', 'uploading', 'paused', 'failed', 'expired', 'cancelled');

CREATE TABLE workflow.upload_event (
  id UUID PRIMARY KEY,
  upload_session_id UUID NOT NULL REFERENCES workflow.upload_session(id),
  actor_user_id TEXT REFERENCES auth."user"(id),
  event_type TEXT NOT NULL,
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT upload_event_type_check CHECK (
    event_type IN ('created', 'started', 'paused', 'resumed', 'completed', 'failed', 'cancelled', 'expired', 'cleanup_completed')
  ),
  CONSTRAINT upload_event_metadata_check CHECK (jsonb_typeof(event_metadata) = 'object')
);

CREATE INDEX upload_event_session_created_idx
  ON workflow.upload_event (upload_session_id, created_at DESC);

CREATE TABLE rights.submission_acknowledgement (
  id UUID PRIMARY KEY,
  submission_revision_id UUID NOT NULL UNIQUE REFERENCES workflow.submission_revision(id),
  acknowledged_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  acknowledgement_text TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT submission_acknowledgement_text_check CHECK (trim(acknowledgement_text) <> '')
);

CREATE OR REPLACE FUNCTION workflow.assert_upload_session_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM catalog.audio_file audio_file
    JOIN catalog.audio_asset asset ON asset.id = audio_file.audio_asset_id
    JOIN workflow.submission_revision revision ON revision.id = asset.submission_revision_id
    JOIN workflow.submission submission ON submission.id = revision.submission_id
    WHERE audio_file.id = NEW.audio_file_id
      AND submission.owner_user_id = NEW.owner_user_id
      AND submission.status = 'draft'
      AND revision.revision_status = 'draft'
  ) THEN
    RAISE EXCEPTION 'Upload Session must belong to the owner of a draft Submission'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER upload_session_owner
BEFORE INSERT OR UPDATE OF audio_file_id, owner_user_id
ON workflow.upload_session
FOR EACH ROW EXECUTE FUNCTION workflow.assert_upload_session_owner();

CREATE OR REPLACE FUNCTION workflow.protect_submitted_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.revision_status <> 'draft' AND (
    NEW.producer_metadata IS DISTINCT FROM OLD.producer_metadata
    OR NEW.embedded_metadata IS DISTINCT FROM OLD.embedded_metadata
    OR NEW.source_notes IS DISTINCT FROM OLD.source_notes
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.submission_id IS DISTINCT FROM OLD.submission_id
    OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
  ) THEN
    RAISE EXCEPTION 'Submitted Revision content is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_submitted_revision
BEFORE UPDATE ON workflow.submission_revision
FOR EACH ROW EXECUTE FUNCTION workflow.protect_submitted_revision();

CREATE TRIGGER upload_session_set_updated_at
BEFORE UPDATE ON workflow.upload_session
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
