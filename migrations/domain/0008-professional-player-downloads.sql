CREATE SCHEMA IF NOT EXISTS media;

CREATE TABLE media.playback_artifact (
  id UUID PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  audio_asset_id UUID NOT NULL REFERENCES catalog.audio_asset(id),
  source_audio_file_id UUID NOT NULL REFERENCES catalog.audio_file(id),
  preview_audio_file_id UUID REFERENCES catalog.audio_file(id),
  preview_provider_drive_id TEXT,
  preview_provider_item_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  profile_version INTEGER NOT NULL,
  waveform_peaks SMALLINT[],
  waveform_peak_count INTEGER,
  last_error_code TEXT,
  last_error_message TEXT,
  ready_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT playback_artifact_status_check
    CHECK (status IN ('queued', 'building', 'ready', 'failed')),
  CONSTRAINT playback_artifact_profile_check CHECK (profile_version > 0),
  CONSTRAINT playback_artifact_waveform_shape_check CHECK (
    (waveform_peaks IS NULL AND waveform_peak_count IS NULL)
    OR (
      waveform_peak_count > 0
      AND cardinality(waveform_peaks) = waveform_peak_count * 2
    )
  ),
  CONSTRAINT playback_artifact_ready_shape_check CHECK (
    status <> 'ready'
    OR (
      preview_audio_file_id IS NOT NULL
      AND waveform_peaks IS NOT NULL
      AND ready_at IS NOT NULL
    )
  ),
  CONSTRAINT playback_artifact_source_profile_unique
    UNIQUE (source_audio_file_id, profile_version)
);

CREATE INDEX playback_artifact_track_revision_idx
  ON media.playback_artifact (track_id, submission_revision_id, status);
CREATE INDEX playback_artifact_status_idx
  ON media.playback_artifact (status, updated_at, id);

CREATE TABLE media.download_package (
  id UUID PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  source_fingerprint TEXT NOT NULL,
  format_version INTEGER NOT NULL DEFAULT 1,
  storage_backend TEXT,
  storage_key TEXT,
  provider_drive_id TEXT,
  provider_item_id TEXT,
  byte_size BIGINT,
  checksum_sha256 TEXT,
  source_byte_size BIGINT NOT NULL,
  file_count INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  last_error_code TEXT,
  last_error_message TEXT,
  ready_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT download_package_scope_check CHECK (scope IN ('stems', 'full')),
  CONSTRAINT download_package_status_check
    CHECK (status IN ('queued', 'building', 'ready', 'failed', 'expired', 'cancelled')),
  CONSTRAINT download_package_fingerprint_check
    CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT download_package_sha_check
    CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT download_package_sizes_check
    CHECK (source_byte_size >= 0 AND file_count > 0 AND (byte_size IS NULL OR byte_size >= 0)),
  CONSTRAINT download_package_ready_shape_check CHECK (
    status <> 'ready'
    OR (
      storage_backend IN ('local', 'onedrive')
      AND storage_key IS NOT NULL
      AND byte_size IS NOT NULL
      AND checksum_sha256 IS NOT NULL
      AND ready_at IS NOT NULL
      AND expires_at IS NOT NULL
    )
  )
);

CREATE INDEX download_package_track_revision_idx
  ON media.download_package (track_id, submission_revision_id, scope, created_at DESC);
CREATE INDEX download_package_status_idx
  ON media.download_package (status, expires_at, updated_at, id);
CREATE UNIQUE INDEX download_package_ready_fingerprint_idx
  ON media.download_package (track_id, submission_revision_id, scope, source_fingerprint)
  WHERE status IN ('queued', 'building', 'ready');

CREATE TABLE media.delivery_job (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL,
  playback_artifact_id UUID REFERENCES media.playback_artifact(id),
  download_package_id UUID REFERENCES media.download_package(id),
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT delivery_job_type_check CHECK (job_type IN ('preview', 'package')),
  CONSTRAINT delivery_job_status_check
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT delivery_job_attempts_check
    CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts),
  CONSTRAINT delivery_job_subject_check CHECK (
    (job_type = 'preview' AND playback_artifact_id IS NOT NULL AND download_package_id IS NULL)
    OR
    (job_type = 'package' AND download_package_id IS NOT NULL AND playback_artifact_id IS NULL)
  ),
  CONSTRAINT delivery_job_lease_check CHECK (
    (status = 'running' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR status <> 'running'
  )
);

CREATE INDEX delivery_job_claim_idx
  ON media.delivery_job (available_at, created_at, id)
  WHERE status = 'queued';
CREATE INDEX delivery_job_lease_idx
  ON media.delivery_job (lease_expires_at, id)
  WHERE status = 'running';
CREATE UNIQUE INDEX delivery_job_active_preview_idx
  ON media.delivery_job (playback_artifact_id)
  WHERE status IN ('queued', 'running');
CREATE UNIQUE INDEX delivery_job_active_package_idx
  ON media.delivery_job (download_package_id)
  WHERE status IN ('queued', 'running');

CREATE OR REPLACE FUNCTION media.assert_playback_artifact_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM catalog.audio_asset asset
    JOIN catalog.audio_file source
      ON source.id = NEW.source_audio_file_id
     AND source.audio_asset_id = asset.id
     AND source.file_role = 'source'
    WHERE asset.id = NEW.audio_asset_id
      AND asset.track_id = NEW.track_id
      AND asset.submission_revision_id = NEW.submission_revision_id
  ) THEN
    RAISE EXCEPTION 'Playback Artifact source must belong to its Track Revision Audio Asset'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.preview_audio_file_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM catalog.audio_file preview
    WHERE preview.id = NEW.preview_audio_file_id
      AND preview.audio_asset_id = NEW.audio_asset_id
      AND preview.file_role = 'preview'
  ) THEN
    RAISE EXCEPTION 'Playback Artifact preview must belong to the same Audio Asset'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER playback_artifact_subject
BEFORE INSERT OR UPDATE OF track_id, submission_revision_id, audio_asset_id,
  source_audio_file_id, preview_audio_file_id
ON media.playback_artifact
FOR EACH ROW EXECUTE FUNCTION media.assert_playback_artifact_subject();

CREATE OR REPLACE FUNCTION media.assert_download_package_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM workflow.submission_revision revision
    JOIN workflow.submission submission ON submission.id = revision.submission_id
    WHERE revision.id = NEW.submission_revision_id
      AND submission.track_id = NEW.track_id
  ) THEN
    RAISE EXCEPTION 'Download Package revision must belong to its Track'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER download_package_subject
BEFORE INSERT OR UPDATE OF track_id, submission_revision_id
ON media.download_package
FOR EACH ROW EXECUTE FUNCTION media.assert_download_package_subject();

CREATE TRIGGER playback_artifact_set_updated_at
BEFORE UPDATE ON media.playback_artifact
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER delivery_job_set_updated_at
BEFORE UPDATE ON media.delivery_job
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER download_package_set_updated_at
BEFORE UPDATE ON media.download_package
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
