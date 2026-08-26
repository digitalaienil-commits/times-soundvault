DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension extension
    JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
    WHERE extension.extname = 'pg_trgm'
      AND namespace.nspname <> 'public'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA public;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS planning;

CREATE TABLE planning.demand (
  id UUID PRIMARY KEY,
  demand_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  title TEXT NOT NULL,
  requester_name TEXT,
  requesting_team TEXT,
  project_context TEXT NOT NULL,
  brief TEXT NOT NULL,
  creative_notes TEXT,
  avoid_notes TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'draft',
  asset_kind TEXT NOT NULL DEFAULT 'music',
  target_track_count INTEGER NOT NULL DEFAULT 1,
  response_deadline_on DATE NOT NULL,
  needed_by_on DATE NOT NULL,
  bpm_min NUMERIC,
  bpm_max NUMERIC,
  duration_min_ms BIGINT,
  duration_max_ms BIGINT,
  vocal_state TEXT,
  under_dialogue BOOLEAN,
  loopable BOOLEAN,
  stems_required BOOLEAN NOT NULL DEFAULT false,
  ending_type TEXT,
  owner_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  created_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  brief_version BIGINT NOT NULL DEFAULT 1,
  row_version BIGINT NOT NULL DEFAULT 1,
  opened_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  status_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT demand_title_check CHECK (char_length(trim(title)) BETWEEN 5 AND 120),
  CONSTRAINT demand_requester_name_check CHECK (requester_name IS NULL OR char_length(requester_name) <= 120),
  CONSTRAINT demand_requesting_team_check CHECK (requesting_team IS NULL OR char_length(requesting_team) <= 120),
  CONSTRAINT demand_project_context_check CHECK (char_length(trim(project_context)) BETWEEN 3 AND 300),
  CONSTRAINT demand_brief_check CHECK (char_length(trim(brief)) BETWEEN 20 AND 5000),
  CONSTRAINT demand_creative_notes_check CHECK (creative_notes IS NULL OR char_length(creative_notes) <= 3000),
  CONSTRAINT demand_avoid_notes_check CHECK (avoid_notes IS NULL OR char_length(avoid_notes) <= 2000),
  CONSTRAINT demand_priority_check CHECK (priority IN ('low','normal','high','urgent')),
  CONSTRAINT demand_status_check CHECK (status IN ('draft','open','fulfilled','closed','cancelled')),
  CONSTRAINT demand_asset_kind_check CHECK (asset_kind IN ('music','sound_effect','ambience')),
  CONSTRAINT demand_target_check CHECK (target_track_count BETWEEN 1 AND 25),
  CONSTRAINT demand_dates_check CHECK (response_deadline_on <= needed_by_on),
  CONSTRAINT demand_bpm_check CHECK (
    (bpm_min IS NULL OR (bpm_min > 0 AND bpm_min <= 400)) AND
    (bpm_max IS NULL OR (bpm_max > 0 AND bpm_max <= 400)) AND
    (bpm_min IS NULL OR bpm_max IS NULL OR bpm_min <= bpm_max)
  ),
  CONSTRAINT demand_duration_check CHECK (
    (duration_min_ms IS NULL OR duration_min_ms BETWEEN 1 AND 21600000) AND
    (duration_max_ms IS NULL OR duration_max_ms BETWEEN 1 AND 21600000) AND
    (duration_min_ms IS NULL OR duration_max_ms IS NULL OR duration_min_ms <= duration_max_ms)
  ),
  CONSTRAINT demand_vocal_state_check CHECK (vocal_state IS NULL OR vocal_state IN ('instrumental','vocal','mixed')),
  CONSTRAINT demand_ending_type_check CHECK (ending_type IS NULL OR ending_type IN ('clean_stop','final_hit','fade','open')),
  CONSTRAINT demand_versions_check CHECK (brief_version > 0 AND row_version > 0)
);

CREATE INDEX demand_status_deadline_idx ON planning.demand (status, response_deadline_on, demand_number);
CREATE INDEX demand_status_needed_idx ON planning.demand (status, needed_by_on, demand_number);
CREATE INDEX demand_owner_status_idx ON planning.demand (owner_user_id, status, demand_number);
CREATE INDEX demand_priority_deadline_idx ON planning.demand (priority, response_deadline_on, demand_number);

CREATE TABLE planning.demand_term_requirement (
  id UUID PRIMARY KEY,
  demand_id UUID NOT NULL REFERENCES planning.demand(id),
  term_id UUID NOT NULL REFERENCES catalog.taxonomy_term(id),
  importance TEXT NOT NULL,
  added_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT demand_term_importance_check CHECK (importance IN ('required','preferred')),
  CONSTRAINT demand_term_unique UNIQUE (demand_id, term_id)
);
CREATE INDEX demand_term_requirement_idx ON planning.demand_term_requirement (demand_id, importance, term_id);

CREATE TABLE planning.demand_assignee (
  id UUID PRIMARY KEY,
  demand_id UUID NOT NULL REFERENCES planning.demand(id),
  user_id TEXT NOT NULL REFERENCES auth."user"(id),
  added_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT demand_assignee_unique UNIQUE (demand_id, user_id)
);
CREATE INDEX demand_assignee_user_idx ON planning.demand_assignee (user_id, demand_id);

CREATE TABLE planning.demand_reference_track (
  id UUID PRIMARY KEY,
  demand_id UUID NOT NULL REFERENCES planning.demand(id),
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT demand_reference_note_check CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT demand_reference_sort_check CHECK (sort_order >= 0),
  CONSTRAINT demand_reference_unique UNIQUE (demand_id, track_id)
);
CREATE INDEX demand_reference_sort_idx ON planning.demand_reference_track (demand_id, sort_order, id);

CREATE TABLE planning.demand_response (
  id UUID PRIMARY KEY,
  demand_id UUID NOT NULL REFERENCES planning.demand(id),
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  submission_id UUID REFERENCES workflow.submission(id),
  origin TEXT NOT NULL,
  status TEXT NOT NULL,
  responder_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  pitch_note TEXT,
  decline_reason TEXT,
  brief_version_started BIGINT NOT NULL,
  brief_version_submitted BIGINT,
  submitted_published_revision_id UUID REFERENCES workflow.submission_revision(id),
  accepted_published_revision_id UUID REFERENCES workflow.submission_revision(id),
  row_version BIGINT NOT NULL DEFAULT 1,
  submitted_at TIMESTAMPTZ,
  shortlisted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT demand_response_origin_check CHECK (origin IN ('catalog','submission')),
  CONSTRAINT demand_response_status_check CHECK (status IN ('working','submitted','shortlisted','accepted','declined','withdrawn')),
  CONSTRAINT demand_response_origin_subject_check CHECK (
    (origin='catalog' AND submission_id IS NULL) OR
    (origin='submission' AND submission_id IS NOT NULL)
  ),
  CONSTRAINT demand_response_pitch_check CHECK (pitch_note IS NULL OR char_length(pitch_note) <= 1000),
  CONSTRAINT demand_response_decline_check CHECK (decline_reason IS NULL OR char_length(decline_reason) <= 1000),
  CONSTRAINT demand_response_versions_check CHECK (
    brief_version_started > 0 AND
    (brief_version_submitted IS NULL OR brief_version_submitted > 0) AND
    row_version > 0
  ),
  CONSTRAINT demand_response_unique UNIQUE (demand_id, track_id)
);
CREATE INDEX demand_response_status_idx ON planning.demand_response (demand_id, status, created_at, id);
CREATE INDEX demand_response_responder_idx ON planning.demand_response (responder_user_id, status, demand_id);
CREATE INDEX demand_response_submission_idx ON planning.demand_response (submission_id) WHERE submission_id IS NOT NULL;
CREATE INDEX demand_response_track_idx ON planning.demand_response (track_id, demand_id);

CREATE OR REPLACE FUNCTION planning.assert_response_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.submission_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM workflow.submission submission
    WHERE submission.id=NEW.submission_id AND submission.track_id=NEW.track_id
  ) THEN
    RAISE EXCEPTION 'Demand Response Submission and Track must match'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER demand_response_subject
BEFORE INSERT OR UPDATE OF submission_id, track_id ON planning.demand_response
FOR EACH ROW EXECUTE FUNCTION planning.assert_response_subject();

CREATE TABLE planning.demand_event (
  id UUID PRIMARY KEY,
  demand_id UUID NOT NULL REFERENCES planning.demand(id),
  response_id UUID REFERENCES planning.demand_response(id),
  actor_user_id TEXT REFERENCES auth."user"(id),
  event_type TEXT NOT NULL,
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT demand_event_type_check CHECK (event_type IN (
    'demand_created','demand_updated','demand_opened','demand_reopened','demand_closed','demand_fulfilled','demand_cancelled',
    'assignee_added','assignee_removed','reference_added','reference_removed',
    'response_started','response_submitted','response_refreshed','response_shortlisted','response_accepted',
    'response_unaccepted','response_declined','response_restored','response_withdrawn'
  )),
  CONSTRAINT demand_event_metadata_check CHECK (
    jsonb_typeof(event_metadata)='object' AND pg_column_size(event_metadata) <= 8192
  )
);
CREATE INDEX demand_event_created_idx ON planning.demand_event (demand_id, created_at DESC, id DESC);

CREATE TRIGGER demand_set_updated_at
BEFORE UPDATE ON planning.demand
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER demand_response_set_updated_at
BEFORE UPDATE ON planning.demand_response
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER demand_event_append_only
BEFORE UPDATE OR DELETE ON planning.demand_event
FOR EACH ROW EXECUTE FUNCTION system.reject_append_only_mutation();
