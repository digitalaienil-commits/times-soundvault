CREATE TABLE workflow.review_case (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES workflow.submission(id),
  submission_revision_id UUID NOT NULL UNIQUE REFERENCES workflow.submission_revision(id),
  track_id UUID NOT NULL REFERENCES catalog.track(id),
  status TEXT NOT NULL DEFAULT 'in_progress',
  assigned_to_user_id TEXT REFERENCES auth."user"(id),
  started_by_user_id TEXT REFERENCES auth."user"(id),
  started_at TIMESTAMPTZ,
  ready_for_decision_at TIMESTAMPTZ,
  reopened_at TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_case_status_check
    CHECK (status IN ('in_progress', 'ready_for_decision', 'superseded')),
  CONSTRAINT review_case_version_check CHECK (row_version > 0),
  CONSTRAINT review_case_ready_shape_check CHECK (
    (status = 'ready_for_decision' AND ready_for_decision_at IS NOT NULL)
    OR status <> 'ready_for_decision'
  )
);

CREATE INDEX review_case_queue_idx
  ON workflow.review_case (status, assigned_to_user_id, updated_at, id);
CREATE INDEX review_case_submission_idx
  ON workflow.review_case (submission_id, created_at DESC);

CREATE OR REPLACE FUNCTION workflow.assert_review_case_subject()
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
    RAISE EXCEPTION 'Review Case revision and Track must belong to its Submission'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER review_case_subject
BEFORE INSERT OR UPDATE OF submission_id, submission_revision_id, track_id
ON workflow.review_case
FOR EACH ROW EXECUTE FUNCTION workflow.assert_review_case_subject();

CREATE TABLE workflow.review_metadata_draft (
  review_case_id UUID PRIMARY KEY REFERENCES workflow.review_case(id),
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_metadata_fields_check CHECK (jsonb_typeof(fields) = 'object')
);

CREATE TABLE workflow.review_term_selection (
  id UUID PRIMARY KEY,
  review_case_id UUID NOT NULL REFERENCES workflow.review_case(id),
  term_id UUID NOT NULL REFERENCES catalog.taxonomy_term(id),
  source_assignment_id UUID REFERENCES catalog.track_term_assignment(id),
  source_kind TEXT NOT NULL,
  decision TEXT NOT NULL,
  decided_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_term_source_check
    CHECK (source_kind IN ('producer', 'embedded', 'ai', 'coordinator', 'system')),
  CONSTRAINT review_term_decision_check CHECK (decision IN ('selected', 'rejected')),
  CONSTRAINT review_term_unique UNIQUE (review_case_id, term_id)
);

CREATE INDEX review_term_case_idx
  ON workflow.review_term_selection (review_case_id, decision);

CREATE TABLE workflow.review_check_item (
  id UUID PRIMARY KEY,
  review_case_id UUID NOT NULL REFERENCES workflow.review_case(id),
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  reviewed_by_user_id TEXT REFERENCES auth."user"(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_check_code_check CHECK (
    code IN (
      'master_audio', 'stems', 'technical_qc', 'metadata_core',
      'metadata_editorial', 'rights', 'copyright'
    )
  ),
  CONSTRAINT review_check_status_check
    CHECK (status IN ('pending', 'pass', 'attention', 'not_applicable')),
  CONSTRAINT review_check_attention_note_check CHECK (
    status <> 'attention' OR (note IS NOT NULL AND trim(note) <> '')
  ),
  CONSTRAINT review_check_unique UNIQUE (review_case_id, code)
);

CREATE INDEX review_check_case_idx
  ON workflow.review_check_item (review_case_id, status);

CREATE TABLE workflow.review_note (
  id UUID PRIMARY KEY,
  review_case_id UUID NOT NULL REFERENCES workflow.review_case(id),
  category TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_note_category_check
    CHECK (category IN ('general', 'audio', 'metadata', 'rights', 'copyright')),
  CONSTRAINT review_note_body_check CHECK (trim(body) <> '')
);

CREATE INDEX review_note_case_idx
  ON workflow.review_note (review_case_id, created_at DESC, id);

CREATE TABLE workflow.review_event (
  id UUID PRIMARY KEY,
  review_case_id UUID NOT NULL REFERENCES workflow.review_case(id),
  actor_user_id TEXT REFERENCES auth."user"(id),
  event_type TEXT NOT NULL,
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_event_type_check CHECK (
    event_type IN (
      'case_created', 'claimed', 'released', 'reassigned',
      'metadata_updated', 'taxonomy_updated', 'checklist_updated',
      'note_added', 'ready_for_decision', 'reopened'
    )
  ),
  CONSTRAINT review_event_metadata_check CHECK (jsonb_typeof(event_metadata) = 'object')
);

CREATE INDEX review_event_case_idx
  ON workflow.review_event (review_case_id, created_at DESC, id);

CREATE TRIGGER review_case_set_updated_at
BEFORE UPDATE ON workflow.review_case
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER review_metadata_draft_set_updated_at
BEFORE UPDATE ON workflow.review_metadata_draft
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER review_term_selection_set_updated_at
BEFORE UPDATE ON workflow.review_term_selection
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
CREATE TRIGGER review_check_item_set_updated_at
BEFORE UPDATE ON workflow.review_check_item
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

INSERT INTO catalog.taxonomy_term (id, category, slug, label)
VALUES
  ('70000000-0000-4000-8000-000000000001', 'format', 'background-bed', 'Background Bed'),
  ('70000000-0000-4000-8000-000000000002', 'format', 'stinger', 'Stinger'),
  ('70000000-0000-4000-8000-000000000003', 'format', 'bumper', 'Bumper'),
  ('70000000-0000-4000-8000-000000000004', 'format', 'intro', 'Intro'),
  ('70000000-0000-4000-8000-000000000005', 'format', 'outro', 'Outro'),
  ('70000000-0000-4000-8000-000000000006', 'format', 'transition', 'Transition'),
  ('70000000-0000-4000-8000-000000000007', 'format', 'theme', 'Theme'),
  ('70000000-0000-4000-8000-000000000008', 'format', 'full-track', 'Full Track'),
  ('70000000-0000-4000-8000-000000000101', 'use_case', 'breaking-news', 'Breaking News'),
  ('70000000-0000-4000-8000-000000000102', 'use_case', 'general-news', 'General News'),
  ('70000000-0000-4000-8000-000000000103', 'use_case', 'business', 'Business'),
  ('70000000-0000-4000-8000-000000000104', 'use_case', 'markets', 'Markets'),
  ('70000000-0000-4000-8000-000000000105', 'use_case', 'politics', 'Politics'),
  ('70000000-0000-4000-8000-000000000106', 'use_case', 'elections', 'Elections'),
  ('70000000-0000-4000-8000-000000000107', 'use_case', 'crime', 'Crime'),
  ('70000000-0000-4000-8000-000000000108', 'use_case', 'investigation', 'Investigation'),
  ('70000000-0000-4000-8000-000000000109', 'use_case', 'sports', 'Sports'),
  ('70000000-0000-4000-8000-000000000110', 'use_case', 'technology', 'Technology'),
  ('70000000-0000-4000-8000-000000000111', 'use_case', 'entertainment', 'Entertainment'),
  ('70000000-0000-4000-8000-000000000112', 'use_case', 'human-interest', 'Human Interest'),
  ('70000000-0000-4000-8000-000000000113', 'use_case', 'weather', 'Weather'),
  ('70000000-0000-4000-8000-000000000114', 'use_case', 'documentary', 'Documentary'),
  ('70000000-0000-4000-8000-000000000115', 'use_case', 'promo', 'Promo'),
  ('70000000-0000-4000-8000-000000000116', 'use_case', 'patriotic', 'Patriotic'),
  ('70000000-0000-4000-8000-000000000117', 'use_case', 'festival', 'Festival')
ON CONFLICT (category, slug) DO NOTHING;
