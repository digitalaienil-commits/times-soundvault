CREATE SCHEMA IF NOT EXISTS system;

ALTER TABLE catalog.taxonomy_term
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by_user_id TEXT REFERENCES auth."user"(id),
  ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT REFERENCES auth."user"(id);

ALTER TABLE catalog.taxonomy_term
  DROP CONSTRAINT IF EXISTS taxonomy_description_check,
  ADD CONSTRAINT taxonomy_description_check
    CHECK (description IS NULL OR char_length(description) <= 1000);

ALTER TABLE catalog.taxonomy_term
  DROP CONSTRAINT IF EXISTS taxonomy_sort_order_check,
  ADD CONSTRAINT taxonomy_sort_order_check CHECK (sort_order >= 0);

CREATE INDEX IF NOT EXISTS taxonomy_category_active_sort_idx
  ON catalog.taxonomy_term (category, is_active, sort_order, label);

CREATE TABLE IF NOT EXISTS catalog.taxonomy_term_alias (
  id UUID PRIMARY KEY,
  term_id UUID NOT NULL REFERENCES catalog.taxonomy_term(id),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_by_user_id TEXT REFERENCES auth."user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT taxonomy_alias_text_check CHECK (char_length(trim(alias)) BETWEEN 2 AND 120),
  CONSTRAINT taxonomy_alias_normalized_check CHECK (normalized_alias = lower(trim(normalized_alias))),
  CONSTRAINT taxonomy_alias_unique UNIQUE (term_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS taxonomy_alias_lookup_idx
  ON catalog.taxonomy_term_alias (normalized_alias);

CREATE TABLE IF NOT EXISTS system.admin_audit_event (
  id UUID PRIMARY KEY,
  actor_user_id TEXT REFERENCES auth."user"(id),
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  action TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_subject_check CHECK (
    subject_type IN (
      'system','team','taxonomy','catalog','submission','processing',
      'media','copyright','demand','retention','integrity'
    )
  ),
  CONSTRAINT admin_audit_action_check CHECK (char_length(trim(action)) BETWEEN 3 AND 120),
  CONSTRAINT admin_audit_severity_check CHECK (severity IN ('info','warning','high')),
  CONSTRAINT admin_audit_metadata_check CHECK (
    jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192
  )
);

CREATE INDEX IF NOT EXISTS admin_audit_created_idx
  ON system.admin_audit_event (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_audit_subject_idx
  ON system.admin_audit_event (subject_type, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_audit_actor_idx
  ON system.admin_audit_event (actor_user_id, created_at DESC, id DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS system.maintenance_job (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  requested_by_user_id TEXT REFERENCES auth."user"(id),
  request_summary TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT true,
  max_scope INTEGER NOT NULL DEFAULT 25,
  result_summary TEXT,
  result_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error_code TEXT,
  last_error_message TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT maintenance_job_type_check CHECK (
    job_type IN (
      'system_health_check','search_rebuild','media_reconcile','processing_reclaim',
      'retention_dry_run','retention_cleanup','catalog_integrity_scan'
    )
  ),
  CONSTRAINT maintenance_job_status_check CHECK (
    status IN ('queued','running','succeeded','failed','cancelled')
  ),
  CONSTRAINT maintenance_subject_check CHECK (
    subject_type IN ('system','catalog','processing','media','retention','integrity')
  ),
  CONSTRAINT maintenance_scope_check CHECK (max_scope BETWEEN 1 AND 10000),
  CONSTRAINT maintenance_result_metadata_check CHECK (jsonb_typeof(result_metadata) = 'object'),
  CONSTRAINT maintenance_lease_shape_check CHECK (
    (status = 'running' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR status <> 'running'
  )
);

CREATE INDEX IF NOT EXISTS maintenance_job_claim_idx
  ON system.maintenance_job (available_at, created_at, id)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS maintenance_job_status_idx
  ON system.maintenance_job (status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS system.integrity_finding (
  id UUID PRIMARY KEY,
  finding_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id TEXT REFERENCES auth."user"(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT integrity_finding_severity_check CHECK (severity IN ('info','warning','high')),
  CONSTRAINT integrity_finding_status_check CHECK (status IN ('open','acknowledged','resolved')),
  CONSTRAINT integrity_finding_subject_check CHECK (
    subject_type IN ('catalog','submission','processing','media','copyright','demand','team','system')
  ),
  CONSTRAINT integrity_finding_text_check CHECK (
    char_length(trim(title)) BETWEEN 3 AND 160
    AND char_length(trim(detail)) BETWEEN 3 AND 2000
  ),
  CONSTRAINT integrity_finding_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS integrity_finding_status_idx
  ON system.integrity_finding (status, severity, last_seen_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS integrity_finding_subject_unique_idx
  ON system.integrity_finding (finding_type, subject_type, COALESCE(subject_id, ''))
  WHERE status <> 'resolved';

CREATE TABLE IF NOT EXISTS system.worker_heartbeat (
  worker_key TEXT PRIMARY KEY,
  worker_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT worker_heartbeat_type_check CHECK (
    worker_type IN ('processing','cyanite','media','copyright','maintenance')
  ),
  CONSTRAINT worker_heartbeat_status_check CHECK (
    status IN ('healthy','warning','degraded','disabled','unknown')
  ),
  CONSTRAINT worker_heartbeat_details_check CHECK (jsonb_typeof(details) = 'object')
);

CREATE TRIGGER admin_audit_event_append_only
BEFORE UPDATE OR DELETE ON system.admin_audit_event
FOR EACH ROW EXECUTE FUNCTION system.reject_append_only_mutation();

CREATE TRIGGER maintenance_job_set_updated_at
BEFORE UPDATE ON system.maintenance_job
FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
