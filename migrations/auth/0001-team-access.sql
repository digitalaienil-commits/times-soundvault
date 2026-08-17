CREATE TABLE IF NOT EXISTS auth.team_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  auth_user_id TEXT UNIQUE,
  provider TEXT,
  provider_account_id TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  last_role_changed_at TIMESTAMPTZ,
  CONSTRAINT team_access_normalized_email_check
    CHECK (normalized_email = lower(trim(normalized_email))),
  CONSTRAINT team_access_role_check
    CHECK (role IN ('admin', 'music_producer', 'coordinator', 'user')),
  CONSTRAINT team_access_status_check
    CHECK (status IN ('pending', 'active', 'suspended')),
  CONSTRAINT team_access_provider_check
    CHECK (provider IS NULL OR provider IN ('google', 'microsoft', 'local')),
  CONSTRAINT team_access_identity_pair_check
    CHECK (
      (provider IS NULL AND provider_account_id IS NULL)
      OR (provider IS NOT NULL AND provider_account_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS team_access_provider_identity_key
  ON auth.team_access (provider, provider_account_id)
  WHERE provider IS NOT NULL AND provider_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS team_access_role_status_idx
  ON auth.team_access (role, status);

CREATE TABLE IF NOT EXISTS auth.access_audit_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT,
  target_user_id TEXT,
  target_access_id UUID NOT NULL REFERENCES auth.team_access(id),
  action TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT access_audit_action_check CHECK (
    action IN (
      'team_member_added',
      'identity_activated',
      'role_changed',
      'access_suspended',
      'access_reactivated',
      'sessions_revoked',
      'bootstrap_admin_assigned'
    )
  )
);

CREATE INDEX IF NOT EXISTS access_audit_target_created_idx
  ON auth.access_audit_event (target_access_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auth.soundvault_migration (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
