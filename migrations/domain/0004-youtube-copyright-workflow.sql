CREATE TABLE rights.copyright_check (
  id UUID PRIMARY KEY,
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  round_number INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,
  provider TEXT NOT NULL DEFAULT 'youtube',
  method TEXT NOT NULL DEFAULT 'manual_studio_upload',
  status TEXT NOT NULL DEFAULT 'not_started',
  outcome TEXT,
  eligibility_status TEXT NOT NULL DEFAULT 'unknown',
  readiness_status TEXT NOT NULL DEFAULT 'not_assessed',
  created_by_user_id TEXT REFERENCES auth."user"(id),
  assigned_to_user_id TEXT REFERENCES auth."user"(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT copyright_check_round_check CHECK (round_number > 0),
  CONSTRAINT copyright_check_provider_check CHECK (provider = 'youtube'),
  CONSTRAINT copyright_check_method_check CHECK (
    method IN ('manual_studio_upload', 'manual_cms_review', 'future_content_id_api')
  ),
  CONSTRAINT copyright_check_status_check CHECK (
    status IN (
      'not_started', 'awaiting_technical', 'ready', 'package_queued',
      'package_building', 'package_ready', 'manual_upload_pending',
      'manual_review_pending', 'completed', 'failed', 'cancelled'
    )
  ),
  CONSTRAINT copyright_check_outcome_check CHECK (
    outcome IS NULL OR outcome IN (
      'no_claim_observed', 'third_party_claim_observed',
      'existing_internal_claim', 'reference_overlap', 'ownership_conflict',
      'copyright_strike_observed', 'inconclusive', 'not_applicable'
    )
  ),
  CONSTRAINT copyright_check_eligibility_check CHECK (
    eligibility_status IN (
      'unknown', 'needs_rights_review', 'needs_policy_review',
      'potentially_eligible', 'ineligible', 'approved_for_future_reference'
    )
  ),
  CONSTRAINT copyright_check_readiness_check CHECK (
    readiness_status IN (
      'not_assessed', 'needs_metadata', 'needs_rights_review',
      'needs_policy_review', 'ready_for_future_registration',
      'existing_reference', 'ineligible'
    )
  ),
  CONSTRAINT copyright_check_version_check CHECK (row_version > 0),
  CONSTRAINT copyright_check_round_unique UNIQUE (submission_revision_id, round_number)
);

CREATE UNIQUE INDEX copyright_check_current_revision_idx
  ON rights.copyright_check (submission_revision_id) WHERE is_current;
CREATE INDEX copyright_check_status_idx
  ON rights.copyright_check (status, updated_at DESC);
CREATE INDEX copyright_check_track_idx
  ON rights.copyright_check (track_id, created_at DESC);

CREATE TABLE rights.copyright_eligibility_review (
  id UUID PRIMARY KEY,
  copyright_check_id UUID NOT NULL REFERENCES rights.copyright_check(id),
  checklist JSONB NOT NULL,
  eligibility_status TEXT NOT NULL,
  readiness_status TEXT NOT NULL,
  note TEXT,
  reviewed_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT copyright_eligibility_checklist_check CHECK (
    jsonb_typeof(checklist) = 'object'
  ),
  CONSTRAINT copyright_eligibility_status_check CHECK (
    eligibility_status IN (
      'unknown', 'needs_rights_review', 'needs_policy_review',
      'potentially_eligible', 'ineligible', 'approved_for_future_reference'
    )
  ),
  CONSTRAINT copyright_readiness_status_check CHECK (
    readiness_status IN (
      'not_assessed', 'needs_metadata', 'needs_rights_review',
      'needs_policy_review', 'ready_for_future_registration',
      'existing_reference', 'ineligible'
    )
  )
);

CREATE INDEX copyright_eligibility_review_check_idx
  ON rights.copyright_eligibility_review (copyright_check_id, reviewed_at DESC);

CREATE TABLE rights.copyright_batch (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  youtube_video_id TEXT,
  artifact_key TEXT,
  manifest_key TEXT,
  artifact_sha256 TEXT,
  total_duration_ms BIGINT NOT NULL DEFAULT 0,
  gap_duration_ms INTEGER NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT copyright_batch_status_check CHECK (
    status IN ('queued', 'building', 'ready', 'manual_review', 'completed', 'failed', 'expired', 'cancelled')
  ),
  CONSTRAINT copyright_batch_video_id_check CHECK (
    youtube_video_id IS NULL OR youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
  ),
  CONSTRAINT copyright_batch_artifact_key_check CHECK (
    artifact_key IS NULL OR artifact_key ~ '^batches/[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$'
  ),
  CONSTRAINT copyright_batch_manifest_key_check CHECK (
    manifest_key IS NULL OR manifest_key ~ '^batches/[0-9a-f-]{36}/manifest\.json$'
  ),
  CONSTRAINT copyright_batch_sha_check CHECK (
    artifact_sha256 IS NULL OR artifact_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT copyright_batch_numbers_check CHECK (
    total_duration_ms >= 0 AND gap_duration_ms >= 0 AND item_count >= 0
  )
);

CREATE INDEX copyright_batch_status_idx
  ON rights.copyright_batch (status, created_at DESC);
CREATE UNIQUE INDEX copyright_batch_video_idx
  ON rights.copyright_batch (youtube_video_id) WHERE youtube_video_id IS NOT NULL;

CREATE TABLE rights.copyright_batch_item (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES rights.copyright_batch(id),
  copyright_check_id UUID NOT NULL REFERENCES rights.copyright_check(id),
  submission_id UUID NOT NULL REFERENCES workflow.submission(id),
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  audio_file_id UUID NOT NULL REFERENCES catalog.audio_file(id),
  sequence INTEGER NOT NULL,
  title TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  start_ms BIGINT NOT NULL,
  end_ms BIGINT NOT NULL,
  duration_ms BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT copyright_batch_item_sequence_check CHECK (sequence > 0),
  CONSTRAINT copyright_batch_item_sha_check CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT copyright_batch_item_time_check CHECK (
    start_ms >= 0 AND end_ms > start_ms AND duration_ms = end_ms - start_ms
  ),
  CONSTRAINT copyright_batch_item_batch_revision_unique UNIQUE (batch_id, submission_revision_id),
  CONSTRAINT copyright_batch_item_batch_sequence_unique UNIQUE (batch_id, sequence)
);

CREATE INDEX copyright_batch_item_check_idx
  ON rights.copyright_batch_item (copyright_check_id);

CREATE TABLE rights.copyright_observation (
  id UUID PRIMARY KEY,
  copyright_check_id UUID NOT NULL REFERENCES rights.copyright_check(id),
  batch_item_id UUID REFERENCES rights.copyright_batch_item(id),
  supersedes_observation_id UUID REFERENCES rights.copyright_observation(id),
  observation_type TEXT NOT NULL,
  youtube_video_id TEXT,
  youtube_claim_id TEXT,
  youtube_asset_id TEXT,
  youtube_reference_id TEXT,
  claimant_name TEXT,
  claim_status TEXT,
  claim_policy TEXT,
  claim_origin TEXT,
  match_start_ms BIGINT,
  match_end_ms BIGINT,
  matching_duration_ms BIGINT,
  territories JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  observed_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT copyright_observation_type_check CHECK (
    observation_type IN (
      'content_id_claim', 'copyright_strike', 'ownership_conflict',
      'reference_overlap', 'existing_internal_reference', 'no_claim', 'inconclusive'
    )
  ),
  CONSTRAINT copyright_observation_video_check CHECK (
    youtube_video_id IS NULL OR youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
  ),
  CONSTRAINT copyright_observation_claim_status_check CHECK (
    claim_status IS NULL OR claim_status IN ('active', 'pending', 'inactive', 'unknown')
  ),
  CONSTRAINT copyright_observation_claim_policy_check CHECK (
    claim_policy IS NULL OR claim_policy IN ('monetize', 'track', 'block', 'unknown')
  ),
  CONSTRAINT copyright_observation_territories_check CHECK (jsonb_typeof(territories) = 'array'),
  CONSTRAINT copyright_observation_match_check CHECK (
    (match_start_ms IS NULL OR match_start_ms >= 0)
    AND (match_end_ms IS NULL OR match_end_ms >= 0)
    AND (matching_duration_ms IS NULL OR matching_duration_ms >= 0)
  ),
  CONSTRAINT copyright_observation_strike_note_check CHECK (
    observation_type <> 'copyright_strike' OR (notes IS NOT NULL AND trim(notes) <> '')
  )
);

CREATE INDEX copyright_observation_check_idx
  ON rights.copyright_observation (copyright_check_id, observed_at DESC);
CREATE UNIQUE INDEX copyright_observation_superseded_once_idx
  ON rights.copyright_observation (supersedes_observation_id)
  WHERE supersedes_observation_id IS NOT NULL;

CREATE TABLE rights.youtube_reference_link (
  id UUID PRIMARY KEY,
  copyright_check_id UUID NOT NULL REFERENCES rights.copyright_check(id),
  youtube_asset_id TEXT,
  youtube_reference_id TEXT NOT NULL,
  recorded_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT youtube_reference_id_unique UNIQUE (youtube_reference_id),
  CONSTRAINT youtube_asset_id_unique UNIQUE (youtube_asset_id)
);

CREATE TABLE rights.copyright_check_event (
  id UUID PRIMARY KEY,
  copyright_check_id UUID REFERENCES rights.copyright_check(id),
  batch_id UUID REFERENCES rights.copyright_batch(id),
  actor_user_id TEXT REFERENCES auth."user"(id),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  reason TEXT,
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT copyright_event_type_check CHECK (
    event_type IN (
      'copyright_check_created', 'eligibility_reviewed', 'batch_created',
      'batch_build_started', 'batch_ready', 'manual_video_recorded',
      'claim_observed', 'no_claim_observed', 'conflict_observed',
      'strike_observed', 'observation_superseded', 'reference_link_recorded',
      'check_completed', 'check_reopened'
    )
  ),
  CONSTRAINT copyright_event_severity_check CHECK (severity IN ('info', 'warning', 'high')),
  CONSTRAINT copyright_event_subject_check CHECK (
    copyright_check_id IS NOT NULL OR batch_id IS NOT NULL
  ),
  CONSTRAINT copyright_event_metadata_check CHECK (jsonb_typeof(event_metadata) = 'object')
);

CREATE INDEX copyright_event_check_idx
  ON rights.copyright_check_event (copyright_check_id, created_at DESC);
CREATE INDEX copyright_event_batch_idx
  ON rights.copyright_check_event (batch_id, created_at DESC);

CREATE TABLE rights.copyright_job (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL DEFAULT 'build_test_batch',
  batch_id UUID NOT NULL REFERENCES rights.copyright_batch(id),
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL UNIQUE,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT copyright_job_type_check CHECK (job_type = 'build_test_batch'),
  CONSTRAINT copyright_job_status_check CHECK (
    status IN ('queued', 'running', 'retry_wait', 'succeeded', 'failed', 'cancelled')
  ),
  CONSTRAINT copyright_job_attempts_check CHECK (
    attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts
  ),
  CONSTRAINT copyright_job_lease_check CHECK (
    (status = 'running' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'running' AND lease_owner IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX copyright_job_claim_idx
  ON rights.copyright_job (next_attempt_at, created_at, id)
  WHERE status IN ('queued', 'retry_wait');
CREATE INDEX copyright_job_expired_idx
  ON rights.copyright_job (lease_expires_at) WHERE status = 'running';

CREATE TRIGGER copyright_check_set_updated_at
BEFORE UPDATE ON rights.copyright_check
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER copyright_batch_set_updated_at
BEFORE UPDATE ON rights.copyright_batch
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER copyright_job_set_updated_at
BEFORE UPDATE ON rights.copyright_job
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
