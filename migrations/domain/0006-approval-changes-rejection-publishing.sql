ALTER TABLE workflow.review_case
  DROP CONSTRAINT review_case_status_check,
  DROP CONSTRAINT review_case_ready_shape_check;

ALTER TABLE workflow.review_case
  ADD CONSTRAINT review_case_status_check
    CHECK (status IN ('in_progress', 'ready_for_decision', 'decisioned', 'superseded')),
  ADD CONSTRAINT review_case_ready_shape_check CHECK (
    (status IN ('ready_for_decision', 'decisioned') AND ready_for_decision_at IS NOT NULL)
    OR status IN ('in_progress', 'superseded')
  );

ALTER TABLE catalog.track_metadata
  ADD COLUMN under_dialogue BOOLEAN,
  ADD COLUMN loopable BOOLEAN,
  ADD COLUMN ending_type TEXT,
  ADD CONSTRAINT track_metadata_ending_type_check CHECK (
    ending_type IS NULL OR ending_type IN ('clean_stop', 'final_hit', 'fade', 'open', 'unknown')
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
      AND submission.status IN ('draft', 'changes_requested')
      AND revision.revision_status = 'draft'
  ) THEN
    RAISE EXCEPTION 'Upload Session must belong to the owner of a draft or requested-revision Submission'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE workflow.review_decision (
  id UUID PRIMARY KEY,
  review_case_id UUID NOT NULL REFERENCES workflow.review_case(id),
  submission_id UUID NOT NULL REFERENCES workflow.submission(id),
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  decision_type TEXT NOT NULL,
  parent_decision_id UUID REFERENCES workflow.review_decision(id),
  reason_category TEXT,
  producer_summary TEXT,
  internal_note TEXT,
  attention_acknowledgement TEXT,
  decision_packet JSONB NOT NULL,
  decided_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_decision_type_check CHECK (
    decision_type IN (
      'approve', 'request_changes', 'recommend_reject',
      'confirm_reject', 'return_for_changes'
    )
  ),
  CONSTRAINT review_decision_packet_check CHECK (
    jsonb_typeof(decision_packet) = 'object'
    AND pg_column_size(decision_packet) <= 65536
  ),
  CONSTRAINT review_decision_summary_check CHECK (
    producer_summary IS NULL OR trim(producer_summary) <> ''
  ),
  CONSTRAINT review_decision_parent_shape_check CHECK (
    (decision_type IN ('confirm_reject', 'return_for_changes') AND parent_decision_id IS NOT NULL)
    OR (decision_type IN ('approve', 'request_changes', 'recommend_reject') AND parent_decision_id IS NULL)
  )
);

CREATE UNIQUE INDEX review_decision_primary_case_idx
  ON workflow.review_decision (review_case_id)
  WHERE decision_type IN ('approve', 'request_changes', 'recommend_reject');
CREATE UNIQUE INDEX review_decision_resolution_parent_idx
  ON workflow.review_decision (parent_decision_id)
  WHERE decision_type IN ('confirm_reject', 'return_for_changes');
CREATE INDEX review_decision_submission_idx
  ON workflow.review_decision (submission_id, created_at DESC, id);
CREATE INDEX review_decision_track_idx
  ON workflow.review_decision (track_id, created_at DESC, id);

CREATE OR REPLACE FUNCTION workflow.assert_review_decision_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  review_subject workflow.review_case%ROWTYPE;
  parent_subject workflow.review_decision%ROWTYPE;
BEGIN
  SELECT * INTO review_subject FROM workflow.review_case WHERE id = NEW.review_case_id;
  IF review_subject.id IS NULL
    OR review_subject.submission_id <> NEW.submission_id
    OR review_subject.submission_revision_id <> NEW.submission_revision_id
    OR review_subject.track_id <> NEW.track_id THEN
    RAISE EXCEPTION 'Review Decision subject must match its Review Case'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.parent_decision_id IS NOT NULL THEN
    SELECT * INTO parent_subject FROM workflow.review_decision WHERE id = NEW.parent_decision_id;
    IF parent_subject.id IS NULL
      OR parent_subject.decision_type <> 'recommend_reject'
      OR parent_subject.review_case_id <> NEW.review_case_id
      OR parent_subject.submission_id <> NEW.submission_id
      OR parent_subject.submission_revision_id <> NEW.submission_revision_id
      OR parent_subject.track_id <> NEW.track_id THEN
      RAISE EXCEPTION 'Rejection resolution must reference the matching recommendation'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER review_decision_subject
BEFORE INSERT ON workflow.review_decision
FOR EACH ROW EXECUTE FUNCTION workflow.assert_review_decision_subject();

CREATE TABLE workflow.change_request (
  id UUID PRIMARY KEY,
  review_decision_id UUID NOT NULL UNIQUE REFERENCES workflow.review_decision(id),
  submission_id UUID NOT NULL REFERENCES workflow.submission(id),
  requested_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  status TEXT NOT NULL DEFAULT 'open',
  producer_summary TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  resolved_by_revision_id UUID REFERENCES workflow.submission_revision(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT change_request_status_check CHECK (status IN ('open', 'resolved', 'superseded')),
  CONSTRAINT change_request_summary_check CHECK (trim(producer_summary) <> ''),
  CONSTRAINT change_request_resolution_shape_check CHECK (
    (status = 'resolved' AND resolved_by_revision_id IS NOT NULL AND resolved_at IS NOT NULL)
    OR (status <> 'resolved' AND resolved_by_revision_id IS NULL AND resolved_at IS NULL)
  )
);

CREATE INDEX change_request_submission_idx
  ON workflow.change_request (submission_id, status, created_at DESC, id);

CREATE TABLE workflow.change_request_item (
  id UUID PRIMARY KEY,
  change_request_id UUID NOT NULL REFERENCES workflow.change_request(id),
  category TEXT NOT NULL,
  instruction TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT change_request_item_category_check CHECK (
    category IN ('audio', 'stems', 'technical', 'metadata', 'rights', 'copyright', 'other')
  ),
  CONSTRAINT change_request_item_instruction_check CHECK (trim(instruction) <> ''),
  CONSTRAINT change_request_item_sort_check CHECK (sort_order >= 0),
  CONSTRAINT change_request_item_unique UNIQUE (change_request_id, sort_order)
);

CREATE TABLE catalog.track_publication_event (
  id UUID PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  submission_id UUID NOT NULL REFERENCES workflow.submission(id),
  submission_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  event_type TEXT NOT NULL,
  reason TEXT,
  gate_snapshot JSONB NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT track_publication_event_type_check
    CHECK (event_type IN ('published', 'withdrawn', 'republished')),
  CONSTRAINT track_publication_reason_check CHECK (
    (event_type = 'published' AND reason IS NULL)
    OR (event_type IN ('withdrawn', 'republished') AND reason IS NOT NULL AND trim(reason) <> '')
  ),
  CONSTRAINT track_publication_snapshot_check CHECK (
    jsonb_typeof(gate_snapshot) = 'object'
    AND pg_column_size(gate_snapshot) <= 65536
  )
);

CREATE INDEX track_publication_event_track_idx
  ON catalog.track_publication_event (track_id, created_at DESC, id);
CREATE INDEX track_publication_event_submission_idx
  ON catalog.track_publication_event (submission_id, created_at DESC, id);

CREATE OR REPLACE FUNCTION catalog.assert_publication_event_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM workflow.submission submission
    JOIN workflow.submission_revision revision
      ON revision.id = NEW.submission_revision_id
     AND revision.submission_id = submission.id
    WHERE submission.id = NEW.submission_id
      AND submission.track_id = NEW.track_id
  ) THEN
    RAISE EXCEPTION 'Publication Event revision and Track must belong to its Submission'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER track_publication_event_subject
BEFORE INSERT ON catalog.track_publication_event
FOR EACH ROW EXECUTE FUNCTION catalog.assert_publication_event_subject();

CREATE OR REPLACE FUNCTION system.reject_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER review_decision_append_only
BEFORE UPDATE OR DELETE ON workflow.review_decision
FOR EACH ROW EXECUTE FUNCTION system.reject_append_only_mutation();
CREATE TRIGGER track_publication_event_append_only
BEFORE UPDATE OR DELETE ON catalog.track_publication_event
FOR EACH ROW EXECUTE FUNCTION system.reject_append_only_mutation();

ALTER TABLE workflow.review_event
  DROP CONSTRAINT review_event_type_check;

ALTER TABLE workflow.review_event
  ADD CONSTRAINT review_event_type_check CHECK (
    event_type IN (
      'case_created', 'claimed', 'released', 'reassigned',
      'metadata_updated', 'taxonomy_updated', 'checklist_updated',
      'note_added', 'ready_for_decision', 'reopened',
      'approved', 'changes_requested', 'rejection_recommended',
      'rejection_confirmed', 'returned_for_changes'
    )
  );

CREATE TRIGGER change_request_set_updated_at
BEFORE UPDATE ON workflow.change_request
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
