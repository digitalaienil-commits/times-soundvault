CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS catalog.track_embedding (
  id UUID PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES catalog.track(id) ON DELETE CASCADE,
  published_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_version TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  input_hash TEXT NOT NULL,
  canonical_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  embedding vector(768),
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT track_embedding_dimension_check CHECK (dimension > 0),
  CONSTRAINT track_embedding_status_check CHECK (
    status IN ('queued', 'processing', 'ready', 'stale', 'failed')
  ),
  CONSTRAINT track_embedding_unique_model UNIQUE (track_id, provider, model, dimension)
);

CREATE INDEX IF NOT EXISTS track_embedding_hnsw_cosine_idx
  ON catalog.track_embedding USING hnsw (embedding vector_cosine_ops)
  WHERE status = 'ready';

CREATE INDEX IF NOT EXISTS track_embedding_status_idx
  ON catalog.track_embedding (status, available_at);

CREATE INDEX IF NOT EXISTS track_embedding_track_idx
  ON catalog.track_embedding (track_id, status);

CREATE INDEX IF NOT EXISTS track_embedding_model_idx
  ON catalog.track_embedding (provider, model, dimension);

CREATE TABLE IF NOT EXISTS workflow.ai_generation_record (
  id UUID PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES auth."user"(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_version TEXT,
  prompt TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_audio_file_id UUID REFERENCES catalog.audio_file(id),
  output_duration_ms INTEGER,
  output_format TEXT NOT NULL,
  is_simulated BOOLEAN NOT NULL DEFAULT false,
  created_submission_id UUID REFERENCES workflow.submission(id),
  created_revision_id UUID REFERENCES workflow.submission_revision(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_generation_record_parameters_check CHECK (jsonb_typeof(parameters) = 'object'),
  CONSTRAINT ai_generation_record_duration_check CHECK (output_duration_ms IS NULL OR output_duration_ms > 0)
);

CREATE INDEX IF NOT EXISTS ai_generation_record_actor_idx
  ON workflow.ai_generation_record (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_generation_record_submission_idx
  ON workflow.ai_generation_record (created_submission_id)
  WHERE created_submission_id IS NOT NULL;

-- Stale embedding detection helper function
CREATE OR REPLACE FUNCTION catalog.mark_track_embeddings_stale(target_track_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF target_track_ids IS NOT NULL AND array_length(target_track_ids, 1) > 0 THEN
    UPDATE catalog.track_embedding
    SET status = 'stale',
        updated_at = now()
    WHERE track_id = ANY(target_track_ids)
      AND status = 'ready';
  END IF;
END;
$$;

-- Trigger on catalog.track: mark stale on title, description, version_label, or publication_status change
CREATE OR REPLACE FUNCTION catalog.mark_embeddings_stale_for_track_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND (
      OLD.title IS DISTINCT FROM NEW.title OR
      OLD.description IS DISTINCT FROM NEW.description OR
      OLD.version_label IS DISTINCT FROM NEW.version_label OR
      OLD.publication_status IS DISTINCT FROM NEW.publication_status OR
      OLD.published_revision_id IS DISTINCT FROM NEW.published_revision_id
  )) THEN
    PERFORM catalog.mark_track_embeddings_stale(ARRAY[NEW.id]);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER track_embedding_stale_track_update
AFTER UPDATE ON catalog.track
FOR EACH ROW EXECUTE FUNCTION catalog.mark_embeddings_stale_for_track_change();

-- Trigger on catalog.track_metadata: mark stale when canonical metadata changes
CREATE OR REPLACE FUNCTION catalog.mark_embeddings_stale_for_metadata_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM catalog.mark_track_embeddings_stale(ARRAY[COALESCE(NEW.track_id, OLD.track_id)]);
  RETURN NEW;
END;
$$;

CREATE TRIGGER track_metadata_embedding_stale_change
AFTER INSERT OR UPDATE OR DELETE ON catalog.track_metadata
FOR EACH ROW EXECUTE FUNCTION catalog.mark_embeddings_stale_for_metadata_change();

-- Trigger on catalog.track_term_assignment: mark stale when accepted taxonomy term assignment changes
CREATE OR REPLACE FUNCTION catalog.mark_embeddings_stale_for_term_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  tid UUID;
BEGIN
  tid := COALESCE(NEW.track_id, OLD.track_id);
  IF (
    (TG_OP = 'INSERT' AND NEW.review_status = 'accepted') OR
    (TG_OP = 'DELETE' AND OLD.review_status = 'accepted') OR
    (TG_OP = 'UPDATE' AND (OLD.review_status = 'accepted' OR NEW.review_status = 'accepted'))
  ) THEN
    PERFORM catalog.mark_track_embeddings_stale(ARRAY[tid]);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER track_term_embedding_stale_change
AFTER INSERT OR UPDATE OR DELETE ON catalog.track_term_assignment
FOR EACH ROW EXECUTE FUNCTION catalog.mark_embeddings_stale_for_term_change();
