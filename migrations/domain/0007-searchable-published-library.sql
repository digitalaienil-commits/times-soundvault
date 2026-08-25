CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE catalog.track_search_document (
  track_id UUID PRIMARY KEY REFERENCES catalog.track(id) ON DELETE CASCADE,
  published_revision_id UUID NOT NULL REFERENCES workflow.submission_revision(id),
  search_vector TSVECTOR NOT NULL,
  title_normalized TEXT NOT NULL,
  search_text_normalized TEXT NOT NULL,
  identifier_values TEXT[] NOT NULL DEFAULT '{}'::text[],
  metadata_version BIGINT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT track_search_document_title_check CHECK (trim(title_normalized) <> ''),
  CONSTRAINT track_search_document_metadata_version_check CHECK (metadata_version > 0)
);

CREATE INDEX track_search_document_vector_idx
  ON catalog.track_search_document USING GIN (search_vector);
CREATE INDEX track_search_document_title_trgm_idx
  ON catalog.track_search_document USING GIN (title_normalized gin_trgm_ops);
CREATE INDEX track_search_document_title_prefix_idx
  ON catalog.track_search_document (title_normalized text_pattern_ops);
CREATE INDEX track_search_document_revision_idx
  ON catalog.track_search_document (published_revision_id);

CREATE INDEX track_metadata_library_vocal_bpm_idx
  ON catalog.track_metadata (vocal_state, bpm);
CREATE INDEX track_metadata_library_key_idx
  ON catalog.track_metadata (key_tonic, key_mode);
CREATE INDEX track_metadata_library_energy_idx
  ON catalog.track_metadata (energy_score);
CREATE INDEX track_metadata_library_editorial_idx
  ON catalog.track_metadata (under_dialogue, loopable, ending_type);
CREATE INDEX track_term_assignment_accepted_term_track_idx
  ON catalog.track_term_assignment (term_id, track_id)
  WHERE review_status = 'accepted';
CREATE INDEX file_technical_published_master_duration_idx
  ON analysis.file_technical_result (submission_revision_id, duration_ms)
  WHERE asset_role = 'master';

CREATE OR REPLACE FUNCTION catalog.refresh_track_search_documents(
  requested_track_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (refreshed_count BIGINT, removed_count BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  refreshed BIGINT := 0;
  removed BIGINT := 0;
BEGIN
  DELETE FROM catalog.track_search_document document
  WHERE (requested_track_ids IS NULL OR document.track_id = ANY(requested_track_ids))
    AND NOT EXISTS (
      SELECT 1
      FROM catalog.track track
      WHERE track.id = document.track_id
        AND track.publication_status = 'published'
        AND track.published_revision_id IS NOT NULL
    );
  GET DIAGNOSTICS removed = ROW_COUNT;

  WITH identifier_content AS (
    SELECT identifier.track_id,
           string_agg(identifier.identifier_value, ' ' ORDER BY identifier.identifier_type, identifier.identifier_value) AS labels,
           array_agg(
             DISTINCT lower(regexp_replace(identifier.identifier_value, '[^[:alnum:]]', '', 'g'))
           ) AS normalized_values
    FROM catalog.track_identifier identifier
    WHERE requested_track_ids IS NULL OR identifier.track_id = ANY(requested_track_ids)
    GROUP BY identifier.track_id
  ),
  taxonomy_content AS (
    SELECT assignment.track_id,
           string_agg(term.label, ' ' ORDER BY term.category, term.label, term.id) AS labels
    FROM catalog.track_term_assignment assignment
    JOIN catalog.taxonomy_term term
      ON term.id = assignment.term_id
     AND term.is_active = true
    WHERE assignment.review_status = 'accepted'
      AND (requested_track_ids IS NULL OR assignment.track_id = ANY(requested_track_ids))
    GROUP BY assignment.track_id
  ),
  published_content AS (
    SELECT track.id AS track_id,
           track.published_revision_id,
           lower(regexp_replace(trim(track.title), '\s+', ' ', 'g')) AS title_normalized,
           concat_ws(
             ' ', track.title, identifier_content.labels, taxonomy_content.labels,
             track.description, metadata.description_caption, track.version_label,
             metadata.era, metadata.language_code
           ) AS safe_search_text,
           coalesce(identifier_content.normalized_values, '{}'::text[]) AS identifier_values,
           coalesce(metadata.metadata_version, 1) AS metadata_version,
           concat_ws(' ', track.title, identifier_content.labels) AS weight_a,
           coalesce(taxonomy_content.labels, '') AS weight_b,
           concat_ws(
             ' ', track.description, metadata.description_caption,
             track.version_label, metadata.era, metadata.language_code
           ) AS weight_c
    FROM catalog.track track
    LEFT JOIN catalog.track_metadata metadata ON metadata.track_id = track.id
    LEFT JOIN identifier_content ON identifier_content.track_id = track.id
    LEFT JOIN taxonomy_content ON taxonomy_content.track_id = track.id
    WHERE track.publication_status = 'published'
      AND track.published_revision_id IS NOT NULL
      AND track.title IS NOT NULL
      AND trim(track.title) <> ''
      AND (requested_track_ids IS NULL OR track.id = ANY(requested_track_ids))
  )
  INSERT INTO catalog.track_search_document (
    track_id, published_revision_id, search_vector, title_normalized,
    search_text_normalized, identifier_values, metadata_version, indexed_at
  )
  SELECT track_id,
         published_revision_id,
         setweight(to_tsvector('simple', coalesce(weight_a, '')), 'A')
           || setweight(to_tsvector('english', coalesce(weight_a, '')), 'A')
           || setweight(to_tsvector('simple', coalesce(weight_b, '')), 'B')
           || setweight(to_tsvector('english', coalesce(weight_b, '')), 'B')
           || setweight(to_tsvector('simple', coalesce(weight_c, '')), 'C')
           || setweight(to_tsvector('english', coalesce(weight_c, '')), 'C'),
         title_normalized,
         lower(regexp_replace(trim(safe_search_text), '\s+', ' ', 'g')),
         identifier_values,
         metadata_version,
         now()
  FROM published_content
  ON CONFLICT (track_id) DO UPDATE SET
    published_revision_id = EXCLUDED.published_revision_id,
    search_vector = EXCLUDED.search_vector,
    title_normalized = EXCLUDED.title_normalized,
    search_text_normalized = EXCLUDED.search_text_normalized,
    identifier_values = EXCLUDED.identifier_values,
    metadata_version = EXCLUDED.metadata_version,
    indexed_at = EXCLUDED.indexed_at;
  GET DIAGNOSTICS refreshed = ROW_COUNT;

  RETURN QUERY SELECT refreshed, removed;
END;
$$;

CREATE OR REPLACE FUNCTION catalog.refresh_track_search_document(track_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM catalog.refresh_track_search_documents(ARRAY[track_id]);
END;
$$;

CREATE OR REPLACE FUNCTION catalog.refresh_search_document_for_track_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM catalog.refresh_track_search_document(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER track_search_document_insert
AFTER INSERT ON catalog.track
FOR EACH ROW EXECUTE FUNCTION catalog.refresh_search_document_for_track_change();
CREATE TRIGGER track_search_document_update
AFTER UPDATE OF title, description, version_label, publication_status, published_revision_id
ON catalog.track
FOR EACH ROW EXECUTE FUNCTION catalog.refresh_search_document_for_track_change();

CREATE OR REPLACE FUNCTION catalog.refresh_search_document_for_related_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_track_id UUID;
  new_track_id UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_track_id := OLD.track_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_track_id := NEW.track_id;
  END IF;
  PERFORM catalog.refresh_track_search_documents(
    ARRAY(
      SELECT DISTINCT value
      FROM unnest(ARRAY[old_track_id, new_track_id]) AS ids(value)
      WHERE value IS NOT NULL
    )
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER track_metadata_search_document_change
AFTER INSERT OR UPDATE OR DELETE ON catalog.track_metadata
FOR EACH ROW EXECUTE FUNCTION catalog.refresh_search_document_for_related_change();
CREATE TRIGGER track_identifier_search_document_change
AFTER INSERT OR UPDATE OR DELETE ON catalog.track_identifier
FOR EACH ROW EXECUTE FUNCTION catalog.refresh_search_document_for_related_change();
CREATE TRIGGER track_term_assignment_search_document_change
AFTER INSERT OR UPDATE OR DELETE ON catalog.track_term_assignment
FOR EACH ROW EXECUTE FUNCTION catalog.refresh_search_document_for_related_change();

CREATE OR REPLACE FUNCTION catalog.refresh_search_documents_for_taxonomy_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM catalog.refresh_track_search_documents(
    ARRAY(
      SELECT DISTINCT assignment.track_id
      FROM catalog.track_term_assignment assignment
      WHERE assignment.term_id = NEW.id
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER taxonomy_term_search_document_change
AFTER UPDATE OF label, slug, is_active ON catalog.taxonomy_term
FOR EACH ROW EXECUTE FUNCTION catalog.refresh_search_documents_for_taxonomy_change();

SELECT catalog.refresh_track_search_documents(NULL);
