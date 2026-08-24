CREATE SCHEMA IF NOT EXISTS analysis;

CREATE TABLE analysis.revision_analysis (
  id UUID PRIMARY KEY,
  submission_revision_id UUID NOT NULL UNIQUE REFERENCES workflow.submission_revision(id),
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  technical_status TEXT NOT NULL DEFAULT 'pending',
  cyanite_status TEXT NOT NULL DEFAULT 'not_started',
  overall_status TEXT NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ,
  technical_completed_at TIMESTAMPTZ,
  provider_completed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT revision_analysis_technical_status_check CHECK (
    technical_status IN ('pending', 'processing', 'complete', 'failed')
  ),
  CONSTRAINT revision_analysis_cyanite_status_check CHECK (
    cyanite_status IN (
      'not_started', 'disabled', 'preparing', 'uploading', 'analyzing',
      'complete', 'failed', 'skipped_unsupported_duration'
    )
  ),
  CONSTRAINT revision_analysis_overall_status_check CHECK (
    overall_status IN ('queued', 'processing', 'waiting_provider', 'complete', 'partial', 'failed')
  ),
  CONSTRAINT revision_analysis_row_version_check CHECK (row_version > 0)
);

CREATE INDEX revision_analysis_track_idx
  ON analysis.revision_analysis (track_id, updated_at DESC);
CREATE INDEX revision_analysis_overall_idx
  ON analysis.revision_analysis (overall_status, updated_at)
  WHERE overall_status IN ('queued', 'processing', 'waiting_provider', 'failed');

CREATE TABLE analysis.processing_job (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL,
  submission_id UUID NOT NULL REFERENCES workflow.submission(id),
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT processing_job_type_check CHECK (
    job_type IN ('revision_processing', 'cyanite_result_fetch')
  ),
  CONSTRAINT processing_job_status_check CHECK (
    status IN ('queued', 'running', 'retry_wait', 'succeeded', 'failed', 'cancelled')
  ),
  CONSTRAINT processing_job_attempts_check CHECK (
    attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts
  ),
  CONSTRAINT processing_job_idempotency_check CHECK (trim(idempotency_key) <> ''),
  CONSTRAINT processing_job_lease_shape_check CHECK (
    (status = 'running' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'running' AND lease_owner IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX processing_job_claim_idx
  ON analysis.processing_job (next_attempt_at, created_at, id)
  WHERE status IN ('queued', 'retry_wait');
CREATE INDEX processing_job_expired_lease_idx
  ON analysis.processing_job (lease_expires_at)
  WHERE status = 'running';
CREATE INDEX processing_job_submission_idx
  ON analysis.processing_job (submission_id, created_at DESC);
CREATE INDEX processing_job_revision_idx
  ON analysis.processing_job (submission_revision_id, created_at DESC);

CREATE TABLE analysis.file_technical_result (
  audio_file_id UUID PRIMARY KEY REFERENCES catalog.audio_file(id),
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  asset_id UUID NOT NULL REFERENCES catalog.audio_asset(id),
  asset_role TEXT NOT NULL,
  stem_type TEXT,
  sha256 TEXT NOT NULL,
  duration_ms BIGINT NOT NULL,
  container_format TEXT NOT NULL,
  codec TEXT NOT NULL,
  bit_rate_bps BIGINT,
  sample_rate_hz INTEGER,
  bit_depth INTEGER,
  channels INTEGER,
  channel_layout TEXT,
  integrated_loudness_lufs NUMERIC,
  loudness_range_lu NUMERIC,
  true_peak_dbtp NUMERIC,
  sample_peak_dbfs NUMERIC,
  leading_silence_ms BIGINT,
  trailing_silence_ms BIGINT,
  embedded_tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  tool_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT file_technical_asset_role_check CHECK (asset_role IN ('master', 'stem')),
  CONSTRAINT file_technical_sha256_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT file_technical_duration_check CHECK (duration_ms > 0),
  CONSTRAINT file_technical_bit_rate_check CHECK (bit_rate_bps IS NULL OR bit_rate_bps > 0),
  CONSTRAINT file_technical_sample_rate_check CHECK (sample_rate_hz IS NULL OR sample_rate_hz > 0),
  CONSTRAINT file_technical_bit_depth_check CHECK (bit_depth IS NULL OR bit_depth > 0),
  CONSTRAINT file_technical_channels_check CHECK (channels IS NULL OR channels > 0),
  CONSTRAINT file_technical_silence_check CHECK (
    (leading_silence_ms IS NULL OR leading_silence_ms >= 0)
    AND (trailing_silence_ms IS NULL OR trailing_silence_ms >= 0)
  ),
  CONSTRAINT file_technical_embedded_tags_check CHECK (jsonb_typeof(embedded_tags) = 'object'),
  CONSTRAINT file_technical_tool_versions_check CHECK (jsonb_typeof(tool_versions) = 'object')
);

CREATE INDEX file_technical_revision_idx
  ON analysis.file_technical_result (submission_revision_id, asset_role, asset_id);
CREATE INDEX file_technical_sha256_idx
  ON analysis.file_technical_result (sha256);
CREATE INDEX file_technical_asset_idx
  ON analysis.file_technical_result (asset_id);

CREATE TABLE analysis.qc_issue (
  id UUID PRIMARY KEY,
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  audio_file_id UUID REFERENCES catalog.audio_file(id),
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT qc_issue_code_check CHECK (code ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  CONSTRAINT qc_issue_severity_check CHECK (severity IN ('info', 'warning', 'error')),
  CONSTRAINT qc_issue_message_check CHECK (trim(message) <> ''),
  CONSTRAINT qc_issue_details_check CHECK (jsonb_typeof(details) = 'object')
);

CREATE UNIQUE INDEX qc_issue_revision_file_code_unique_idx
  ON analysis.qc_issue (
    submission_revision_id,
    COALESCE(audio_file_id, '00000000-0000-0000-0000-000000000000'::uuid),
    code
  );
CREATE INDEX qc_issue_revision_severity_idx
  ON analysis.qc_issue (submission_revision_id, severity, created_at);
CREATE INDEX qc_issue_audio_file_idx
  ON analysis.qc_issue (audio_file_id) WHERE audio_file_id IS NOT NULL;

CREATE TABLE analysis.provider_run (
  id UUID PRIMARY KEY,
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  provider TEXT NOT NULL,
  provider_version TEXT NOT NULL,
  provider_track_id TEXT,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preparing',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  input_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_result JSONB,
  normalized_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  CONSTRAINT provider_run_provider_check CHECK (provider IN ('cyanite')),
  CONSTRAINT provider_run_status_check CHECK (
    status IN ('preparing', 'uploading', 'analyzing', 'complete', 'failed')
  ),
  CONSTRAINT provider_run_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT provider_run_input_metadata_check CHECK (jsonb_typeof(input_metadata) = 'object'),
  CONSTRAINT provider_run_external_id_check CHECK (trim(external_id) <> ''),
  CONSTRAINT provider_run_raw_result_check CHECK (
    raw_result IS NULL OR jsonb_typeof(raw_result) = 'object'
  ),
  CONSTRAINT provider_run_normalized_result_check CHECK (
    normalized_result IS NULL OR jsonb_typeof(normalized_result) = 'object'
  ),
  CONSTRAINT provider_run_revision_provider_unique UNIQUE (submission_revision_id, provider),
  CONSTRAINT provider_run_external_id_unique UNIQUE (provider, external_id)
);

CREATE INDEX provider_run_track_idx
  ON analysis.provider_run (provider, provider_track_id)
  WHERE provider_track_id IS NOT NULL;
CREATE INDEX provider_run_status_idx
  ON analysis.provider_run (status, submitted_at)
  WHERE status IN ('preparing', 'uploading', 'analyzing', 'failed');

CREATE TABLE analysis.metadata_suggestion (
  id UUID PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  provider_run_id UUID NOT NULL REFERENCES analysis.provider_run(id),
  field_name TEXT NOT NULL,
  value JSONB NOT NULL,
  confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT metadata_suggestion_field_check CHECK (
    field_name ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
  ),
  CONSTRAINT metadata_suggestion_value_check CHECK (value <> 'null'::jsonb),
  CONSTRAINT metadata_suggestion_confidence_check CHECK (
    confidence IS NULL OR confidence BETWEEN 0 AND 1
  ),
  CONSTRAINT metadata_suggestion_run_field_unique UNIQUE (provider_run_id, field_name)
);

CREATE INDEX metadata_suggestion_track_idx
  ON analysis.metadata_suggestion (track_id, field_name);
CREATE INDEX metadata_suggestion_revision_idx
  ON analysis.metadata_suggestion (submission_revision_id, field_name);
CREATE INDEX metadata_suggestion_provider_run_idx
  ON analysis.metadata_suggestion (provider_run_id);

CREATE TABLE analysis.webhook_event (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  payload_hash TEXT NOT NULL UNIQUE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_status TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  CONSTRAINT webhook_event_provider_check CHECK (provider IN ('cyanite')),
  CONSTRAINT webhook_event_payload_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT webhook_event_resource_check CHECK (
    trim(resource_type) <> '' AND trim(resource_id) <> ''
  ),
  CONSTRAINT webhook_event_event_check CHECK (
    trim(event_type) <> '' AND event_status IN ('finished', 'failed', 'test')
  )
);

CREATE INDEX webhook_event_pending_idx
  ON analysis.webhook_event (received_at, id)
  WHERE processed_at IS NULL;
CREATE INDEX webhook_event_resource_idx
  ON analysis.webhook_event (provider, resource_id, received_at DESC);

CREATE TRIGGER revision_analysis_set_updated_at
BEFORE UPDATE ON analysis.revision_analysis
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER processing_job_set_updated_at
BEFORE UPDATE ON analysis.processing_job
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
