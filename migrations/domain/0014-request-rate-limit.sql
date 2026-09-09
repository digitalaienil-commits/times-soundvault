-- Durable fixed-window rate limiting for sensitive application endpoints.
-- Better Auth limits its own sign-in routes; this covers SoundVault's costly
-- or abusable mutations (AI generation, upload session creation, delivery
-- package builds) across every application instance.

CREATE TABLE IF NOT EXISTS system.rate_limit_counter (
  bucket TEXT NOT NULL,
  subject TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rate_limit_counter_pkey PRIMARY KEY (bucket, subject),
  CONSTRAINT rate_limit_counter_request_count_check CHECK (request_count >= 0)
);

CREATE INDEX IF NOT EXISTS rate_limit_counter_window_idx
  ON system.rate_limit_counter (window_started_at);
