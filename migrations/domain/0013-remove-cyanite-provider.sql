DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'analysis'
      AND table_name = 'revision_analysis'
      AND column_name = 'cyanite_status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'analysis'
      AND table_name = 'revision_analysis'
      AND column_name = 'ai_status'
  ) THEN
    ALTER TABLE analysis.revision_analysis
      RENAME COLUMN cyanite_status TO ai_status;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'analysis'
      AND table_name = 'revision_analysis'
      AND column_name = 'ai_status'
  ) THEN
    ALTER TABLE analysis.revision_analysis
      ADD COLUMN ai_status TEXT NOT NULL DEFAULT 'not_started';
  END IF;
END $$;

UPDATE analysis.revision_analysis
SET ai_status = 'disabled'
WHERE ai_status IN ('preparing', 'uploading', 'analyzing');

ALTER TABLE analysis.revision_analysis
  DROP CONSTRAINT IF EXISTS revision_analysis_cyanite_status_check;
ALTER TABLE analysis.revision_analysis
  DROP CONSTRAINT IF EXISTS revision_analysis_ai_status_check;
ALTER TABLE analysis.revision_analysis
  ADD CONSTRAINT revision_analysis_ai_status_check CHECK (
    ai_status IN (
      'not_started', 'disabled', 'complete', 'failed',
      'skipped_unsupported_duration'
    )
  );

UPDATE analysis.processing_job
SET job_type = 'legacy_ai_result_fetch',
    status = 'cancelled',
    lease_owner = NULL,
    lease_expires_at = NULL,
    completed_at = COALESCE(completed_at, now()),
    last_error_code = COALESCE(last_error_code, 'PROVIDER_REMOVED'),
    last_error_message = COALESCE(
      last_error_message,
      'Legacy external AI metadata provider was removed.'
    )
WHERE job_type = 'cyanite_result_fetch';

ALTER TABLE analysis.processing_job
  DROP CONSTRAINT IF EXISTS processing_job_type_check;
ALTER TABLE analysis.processing_job
  ADD CONSTRAINT processing_job_type_check CHECK (
    job_type IN ('revision_processing', 'legacy_ai_result_fetch')
  );

UPDATE analysis.provider_run
SET provider = 'ai_metadata',
    provider_version = CASE
      WHEN provider_version = 'v7' THEN 'legacy'
      ELSE provider_version
    END
WHERE provider = 'cyanite';

ALTER TABLE analysis.provider_run
  DROP CONSTRAINT IF EXISTS provider_run_provider_check;
ALTER TABLE analysis.provider_run
  ADD CONSTRAINT provider_run_provider_check CHECK (
    provider IN ('ai_metadata', 'gemini', 'local_essentia')
  );

UPDATE analysis.webhook_event
SET provider = 'ai_metadata',
    processing_error = COALESCE(
      processing_error,
      'Legacy external AI metadata webhook retired.'
    ),
    processed_at = COALESCE(processed_at, now())
WHERE provider = 'cyanite';

ALTER TABLE analysis.webhook_event
  DROP CONSTRAINT IF EXISTS webhook_event_provider_check;
ALTER TABLE analysis.webhook_event
  ADD CONSTRAINT webhook_event_provider_check CHECK (
    provider IN ('ai_metadata')
  );

UPDATE system.worker_heartbeat
SET worker_type = 'processing',
    details = details || '{"legacyProviderRemoved": true}'::jsonb
WHERE worker_type = 'cyanite';

ALTER TABLE system.worker_heartbeat
  DROP CONSTRAINT IF EXISTS worker_heartbeat_type_check;
ALTER TABLE system.worker_heartbeat
  ADD CONSTRAINT worker_heartbeat_type_check CHECK (
    worker_type IN ('processing','media','copyright','maintenance')
  );
