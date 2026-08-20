CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS workflow;
CREATE SCHEMA IF NOT EXISTS rights;

CREATE OR REPLACE FUNCTION system.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE catalog.composition (
  id UUID PRIMARY KEY,
  title TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog.composition_identifier (
  id UUID PRIMARY KEY,
  composition_id UUID NOT NULL REFERENCES catalog.composition(id),
  identifier_type TEXT NOT NULL,
  identifier_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT composition_identifier_type_check
    CHECK (identifier_type IN ('iswc', 'legacy', 'custom')),
  CONSTRAINT composition_identifier_value_check
    CHECK (identifier_value = trim(identifier_value) AND identifier_value <> ''),
  CONSTRAINT composition_identifier_unique UNIQUE (identifier_type, identifier_value)
);

CREATE INDEX composition_identifier_composition_idx
  ON catalog.composition_identifier (composition_id);

CREATE TABLE catalog.track (
  id UUID PRIMARY KEY,
  composition_id UUID REFERENCES catalog.composition(id),
  parent_track_id UUID REFERENCES catalog.track(id),
  asset_kind TEXT NOT NULL DEFAULT 'music',
  title TEXT,
  description TEXT,
  version_type TEXT NOT NULL DEFAULT 'original',
  version_label TEXT,
  publication_status TEXT NOT NULL DEFAULT 'unpublished',
  published_revision_id UUID,
  created_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  published_by_user_id TEXT REFERENCES auth."user"(id),
  published_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT track_asset_kind_check
    CHECK (asset_kind IN ('music', 'sound_effect', 'ambience')),
  CONSTRAINT track_version_type_check
    CHECK (version_type IN ('original', 'alternate', 'cutdown', 'instrumental', 'remix', 'other')),
  CONSTRAINT track_publication_status_check
    CHECK (publication_status IN ('unpublished', 'published', 'withdrawn', 'archived')),
  CONSTRAINT track_parent_not_self_check CHECK (parent_track_id IS NULL OR parent_track_id <> id),
  CONSTRAINT track_row_version_check CHECK (row_version > 0),
  CONSTRAINT track_published_fields_check CHECK (
    publication_status <> 'published'
    OR (
      published_revision_id IS NOT NULL
      AND published_by_user_id IS NOT NULL
      AND published_at IS NOT NULL
    )
  )
);

CREATE INDEX track_publication_status_idx
  ON catalog.track (publication_status, published_at DESC);
CREATE INDEX track_parent_track_idx
  ON catalog.track (parent_track_id) WHERE parent_track_id IS NOT NULL;
CREATE INDEX track_composition_idx
  ON catalog.track (composition_id) WHERE composition_id IS NOT NULL;

CREATE TABLE catalog.track_identifier (
  id UUID PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  identifier_type TEXT NOT NULL,
  identifier_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT track_identifier_type_check
    CHECK (identifier_type IN ('isrc', 'legacy', 'custom')),
  CONSTRAINT track_identifier_value_check
    CHECK (identifier_value = trim(identifier_value) AND identifier_value <> ''),
  CONSTRAINT track_identifier_isrc_shape_check CHECK (
    identifier_type <> 'isrc'
    OR identifier_value ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'
  ),
  CONSTRAINT track_identifier_unique UNIQUE (identifier_type, identifier_value)
);

CREATE INDEX track_identifier_track_idx
  ON catalog.track_identifier (track_id);

CREATE TABLE workflow.submission_batch (
  id UUID PRIMARY KEY,
  created_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow.submission (
  id UUID PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  batch_id UUID REFERENCES workflow.submission_batch(id),
  owner_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  status TEXT NOT NULL DEFAULT 'draft',
  current_revision_id UUID,
  latest_revision_number INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  review_started_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT submission_status_check CHECK (
    status IN (
      'draft', 'submitted', 'processing', 'ready_for_review', 'in_review',
      'changes_requested', 'rejection_recommended', 'approved', 'rejected', 'archived'
    )
  ),
  CONSTRAINT submission_latest_revision_check CHECK (latest_revision_number >= 0),
  CONSTRAINT submission_row_version_check CHECK (row_version > 0),
  CONSTRAINT submission_revision_pair_check CHECK (
    (current_revision_id IS NULL AND latest_revision_number = 0)
    OR (current_revision_id IS NOT NULL AND latest_revision_number > 0)
  )
);

CREATE INDEX submission_owner_created_idx
  ON workflow.submission (owner_user_id, created_at DESC);
CREATE INDEX submission_status_updated_idx
  ON workflow.submission (status, updated_at ASC);
CREATE INDEX submission_track_idx ON workflow.submission (track_id);
CREATE INDEX submission_batch_idx
  ON workflow.submission (batch_id) WHERE batch_id IS NOT NULL;

CREATE TABLE workflow.submission_revision (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES workflow.submission(id),
  revision_number INTEGER NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  revision_status TEXT NOT NULL DEFAULT 'draft',
  producer_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedded_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  CONSTRAINT submission_revision_number_check CHECK (revision_number >= 1),
  CONSTRAINT submission_revision_status_check
    CHECK (revision_status IN ('draft', 'submitted', 'superseded', 'accepted', 'rejected')),
  CONSTRAINT submission_revision_producer_metadata_check
    CHECK (jsonb_typeof(producer_metadata) = 'object'),
  CONSTRAINT submission_revision_embedded_metadata_check
    CHECK (jsonb_typeof(embedded_metadata) = 'object'),
  CONSTRAINT submission_revision_submitted_at_check CHECK (
    revision_status = 'draft' OR submitted_at IS NOT NULL
  ),
  CONSTRAINT submission_revision_number_unique UNIQUE (submission_id, revision_number),
  CONSTRAINT submission_revision_id_submission_unique UNIQUE (id, submission_id)
);

CREATE INDEX submission_revision_submission_created_idx
  ON workflow.submission_revision (submission_id, revision_number DESC);

ALTER TABLE workflow.submission
  ADD CONSTRAINT submission_current_revision_fk
  FOREIGN KEY (current_revision_id, id)
  REFERENCES workflow.submission_revision (id, submission_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE catalog.track
  ADD CONSTRAINT track_published_revision_fk
  FOREIGN KEY (published_revision_id)
  REFERENCES workflow.submission_revision(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION catalog.assert_track_revision_matches()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.published_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM workflow.submission_revision revision
    JOIN workflow.submission submission ON submission.id = revision.submission_id
    WHERE revision.id = NEW.published_revision_id
      AND submission.track_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Published revision must belong to the same Track'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER track_revision_matches
AFTER INSERT OR UPDATE OF published_revision_id ON catalog.track
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION catalog.assert_track_revision_matches();

CREATE TABLE catalog.audio_asset (
  id UUID PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  asset_role TEXT NOT NULL,
  stem_type TEXT,
  stem_label TEXT,
  display_title TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audio_asset_role_check CHECK (asset_role IN ('master', 'stem')),
  CONSTRAINT audio_asset_stem_shape_check CHECK (
    (asset_role = 'master' AND stem_type IS NULL AND stem_label IS NULL)
    OR (
      asset_role = 'stem'
      AND stem_type IS NOT NULL
      AND stem_type ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
    )
  ),
  CONSTRAINT audio_asset_sort_order_check CHECK (sort_order >= 0)
);

CREATE UNIQUE INDEX audio_asset_one_master_per_revision_idx
  ON catalog.audio_asset (submission_revision_id)
  WHERE asset_role = 'master';
CREATE INDEX audio_asset_track_sort_idx
  ON catalog.audio_asset (track_id, sort_order, created_at);
CREATE INDEX audio_asset_revision_sort_idx
  ON catalog.audio_asset (submission_revision_id, sort_order, created_at);

CREATE OR REPLACE FUNCTION catalog.assert_audio_asset_revision_track()
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
    RAISE EXCEPTION 'Audio Asset Track must match its Submission Revision Track'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audio_asset_revision_track
BEFORE INSERT OR UPDATE OF track_id, submission_revision_id
ON catalog.audio_asset
FOR EACH ROW EXECUTE FUNCTION catalog.assert_audio_asset_revision_track();

CREATE TABLE catalog.audio_file (
  id UUID PRIMARY KEY,
  audio_asset_id UUID NOT NULL REFERENCES catalog.audio_asset(id),
  file_role TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  storage_backend TEXT,
  storage_key TEXT,
  content_type TEXT,
  container_format TEXT,
  codec TEXT,
  byte_size BIGINT,
  checksum_sha256 TEXT,
  duration_ms BIGINT,
  sample_rate_hz INTEGER,
  bit_depth INTEGER,
  channels INTEGER,
  integrated_loudness_lufs NUMERIC,
  loudness_range_lu NUMERIC,
  true_peak_dbtp NUMERIC,
  technical_status TEXT NOT NULL DEFAULT 'registered',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audio_file_role_check
    CHECK (file_role IN ('source', 'preview', 'analysis_derivative')),
  CONSTRAINT audio_file_technical_status_check
    CHECK (technical_status IN ('registered', 'uploading', 'available', 'failed', 'quarantined')),
  CONSTRAINT audio_file_filename_check CHECK (trim(original_filename) <> ''),
  CONSTRAINT audio_file_byte_size_check CHECK (byte_size IS NULL OR byte_size >= 0),
  CONSTRAINT audio_file_checksum_check CHECK (
    checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT audio_file_duration_check CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT audio_file_sample_rate_check CHECK (sample_rate_hz IS NULL OR sample_rate_hz > 0),
  CONSTRAINT audio_file_bit_depth_check CHECK (bit_depth IS NULL OR bit_depth > 0),
  CONSTRAINT audio_file_channels_check CHECK (channels IS NULL OR channels > 0)
);

CREATE INDEX audio_file_asset_idx ON catalog.audio_file (audio_asset_id);
CREATE INDEX audio_file_checksum_idx
  ON catalog.audio_file (checksum_sha256) WHERE checksum_sha256 IS NOT NULL;

CREATE TABLE catalog.track_metadata (
  track_id UUID PRIMARY KEY REFERENCES catalog.track(id),
  bpm NUMERIC,
  key_tonic TEXT,
  key_mode TEXT,
  time_signature TEXT,
  energy_score NUMERIC,
  valence NUMERIC,
  arousal NUMERIC,
  vocal_state TEXT NOT NULL DEFAULT 'unknown',
  language_code TEXT,
  era TEXT,
  description_caption TEXT,
  metadata_version BIGINT NOT NULL DEFAULT 1,
  updated_by_user_id TEXT REFERENCES auth."user"(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT track_metadata_bpm_check CHECK (bpm IS NULL OR (bpm > 0 AND bpm <= 400)),
  CONSTRAINT track_metadata_energy_check CHECK (energy_score IS NULL OR energy_score BETWEEN 0 AND 1),
  CONSTRAINT track_metadata_valence_check CHECK (valence IS NULL OR valence BETWEEN 0 AND 1),
  CONSTRAINT track_metadata_arousal_check CHECK (arousal IS NULL OR arousal BETWEEN 0 AND 1),
  CONSTRAINT track_metadata_vocal_state_check
    CHECK (vocal_state IN ('unknown', 'instrumental', 'vocal', 'mixed')),
  CONSTRAINT track_metadata_language_code_check CHECK (
    language_code IS NULL OR language_code ~ '^[a-z]{2,3}(?:-[A-Z]{2})?$'
  ),
  CONSTRAINT track_metadata_version_check CHECK (metadata_version > 0)
);

CREATE TABLE catalog.taxonomy_term (
  id UUID PRIMARY KEY,
  category TEXT NOT NULL,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  parent_term_id UUID REFERENCES catalog.taxonomy_term(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT taxonomy_category_check CHECK (
    category IN (
      'genre', 'subgenre', 'mood', 'instrument', 'theme', 'festival',
      'use_case', 'character', 'movement', 'era', 'format',
      'geo_genre', 'geo_subgenre'
    )
  ),
  CONSTRAINT taxonomy_slug_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT taxonomy_label_check CHECK (trim(label) <> ''),
  CONSTRAINT taxonomy_parent_not_self_check CHECK (parent_term_id IS NULL OR parent_term_id <> id),
  CONSTRAINT taxonomy_category_slug_unique UNIQUE (category, slug)
);

CREATE INDEX taxonomy_parent_idx
  ON catalog.taxonomy_term (parent_term_id) WHERE parent_term_id IS NOT NULL;

CREATE TABLE catalog.track_term_assignment (
  id UUID PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  term_id UUID NOT NULL REFERENCES catalog.taxonomy_term(id),
  submission_revision_id UUID REFERENCES workflow.submission_revision(id),
  source_kind TEXT NOT NULL,
  confidence NUMERIC,
  review_status TEXT NOT NULL DEFAULT 'suggested',
  assigned_by_user_id TEXT REFERENCES auth."user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT track_term_source_kind_check
    CHECK (source_kind IN ('producer', 'embedded', 'ai', 'coordinator', 'system')),
  CONSTRAINT track_term_review_status_check
    CHECK (review_status IN ('suggested', 'accepted', 'rejected')),
  CONSTRAINT track_term_confidence_check
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
);

CREATE UNIQUE INDEX track_term_assignment_source_unique_idx
  ON catalog.track_term_assignment (
    track_id,
    term_id,
    COALESCE(submission_revision_id, '00000000-0000-0000-0000-000000000000'::uuid),
    source_kind
  );
CREATE INDEX track_term_assignment_track_idx
  ON catalog.track_term_assignment (track_id, review_status);
CREATE INDEX track_term_assignment_term_idx
  ON catalog.track_term_assignment (term_id, review_status);

CREATE TABLE rights.rights_declaration (
  id UUID PRIMARY KEY,
  submission_revision_id UUID NOT NULL UNIQUE REFERENCES workflow.submission_revision(id),
  master_rights_basis TEXT NOT NULL,
  master_owner_name TEXT,
  composition_rights_basis TEXT NOT NULL,
  composition_owner_name TEXT,
  publisher_name TEXT,
  territory TEXT,
  valid_from DATE,
  valid_until DATE,
  one_stop_clearance BOOLEAN,
  content_id_eligibility TEXT NOT NULL DEFAULT 'unknown',
  source_reference TEXT,
  notes TEXT,
  declared_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rights_master_basis_check
    CHECK (master_rights_basis IN ('owned', 'exclusive_license', 'non_exclusive_license', 'unknown')),
  CONSTRAINT rights_composition_basis_check
    CHECK (composition_rights_basis IN ('owned', 'exclusive_license', 'non_exclusive_license', 'unknown')),
  CONSTRAINT rights_content_id_eligibility_check
    CHECK (content_id_eligibility IN ('unknown', 'eligible', 'ineligible', 'needs_review')),
  CONSTRAINT rights_valid_dates_check CHECK (
    valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from
  )
);

CREATE INDEX rights_declaration_revision_idx
  ON rights.rights_declaration (submission_revision_id);

CREATE TABLE workflow.submission_event (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES workflow.submission(id),
  submission_revision_id UUID REFERENCES workflow.submission_revision(id),
  actor_user_id TEXT REFERENCES auth."user"(id),
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT submission_event_type_check CHECK (
    event_type IN (
      'created', 'submitted', 'processing_started', 'ready_for_review',
      'review_started', 'changes_requested', 'resubmitted',
      'rejection_recommended', 'approved', 'rejected', 'published',
      'unpublished', 'archived'
    )
  ),
  CONSTRAINT submission_event_from_status_check CHECK (
    from_status IS NULL OR from_status IN (
      'draft', 'submitted', 'processing', 'ready_for_review', 'in_review',
      'changes_requested', 'rejection_recommended', 'approved', 'rejected', 'archived'
    )
  ),
  CONSTRAINT submission_event_to_status_check CHECK (
    to_status IS NULL OR to_status IN (
      'draft', 'submitted', 'processing', 'ready_for_review', 'in_review',
      'changes_requested', 'rejection_recommended', 'approved', 'rejected', 'archived'
    )
  ),
  CONSTRAINT submission_event_metadata_check
    CHECK (jsonb_typeof(event_metadata) = 'object')
);

CREATE INDEX submission_event_submission_created_idx
  ON workflow.submission_event (submission_id, created_at DESC);
CREATE INDEX submission_event_revision_idx
  ON workflow.submission_event (submission_revision_id)
  WHERE submission_revision_id IS NOT NULL;

CREATE TRIGGER composition_set_updated_at
BEFORE UPDATE ON catalog.composition
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER track_set_updated_at
BEFORE UPDATE ON catalog.track
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER submission_batch_set_updated_at
BEFORE UPDATE ON workflow.submission_batch
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER submission_set_updated_at
BEFORE UPDATE ON workflow.submission
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER audio_file_set_updated_at
BEFORE UPDATE ON catalog.audio_file
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER taxonomy_term_set_updated_at
BEFORE UPDATE ON catalog.taxonomy_term
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER track_term_assignment_set_updated_at
BEFORE UPDATE ON catalog.track_term_assignment
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER rights_declaration_set_updated_at
BEFORE UPDATE ON rights.rights_declaration
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
