# Technical processing and AI analysis

Section 5 adds a durable PostgreSQL-backed processing boundary after a Revision
is submitted. The submission transition, `analysis.revision_analysis` row, and
idempotent `revision_processing` job commit together. A separate Node.js worker
claims jobs with `FOR UPDATE SKIP LOCKED`, a bounded lease, attempt limits, and
exponential retry delay.

```text
Next.js application -> PostgreSQL durable jobs -> Processing worker
                                               -> private storage
                                               -> FFmpeg/ffprobe
                                               -> Essentia.js local features
                                               -> Gemini semantic metadata
                                               -> AI metadata boundary
```

## Technical processing

The worker streams each source into a random mode-0700 run directory outside
`public/` and never changes the original. `ffprobe` reads the first audio stream
and a bounded tag allowlist. FFmpeg measures integrated loudness, loudness range,
true/sample peak, and leading/trailing silence. SHA-256 is streamed. Master and
Stem durations use a 250 ms tolerance. QC warnings cover excessive silence,
near-full-scale peaks, unusual channel layouts, missing WAV bit depth, possible
duplicates, long Masters, and Stem duration mismatch.

Successful technical processing now runs the provider-neutral AI metadata path
when `AI_ANALYSIS_ENABLED` is not disabled and `GEMINI_API_KEY` is configured.
The Master source is decoded locally into bounded mono PCM, Essentia.js extracts
tempo, key, energy, loudness and spectral features, and Gemini receives only the
technical facts plus local features to produce structured metadata. The original
audio file is not sent to Gemini by this workflow. If AI analysis is disabled or
the key is missing, the revision still advances to Coordinator review with
`ai_status='disabled'`. If Gemini or Essentia fails after technical processing,
the revision advances as `partial` with a review-visible warning.

Run `pnpm processing:worker` for the long-lived worker,
`pnpm processing:once` for one job, `pnpm processing:reconcile` after an outage,
`pnpm processing:cleanup` for stale private run directories, and
`pnpm analysis:verify` to verify FFmpeg, Essentia and optional Gemini metadata
from a temporary local tone. Workers are safely restartable because abandoned
running jobs become claimable after their lease expires.

## AI metadata boundary

AI suggestions are stored separately from canonical metadata and remain
Coordinator-reviewable. Suggested genres, moods, instruments, tempo, key,
descriptions and taxonomy assignments never overwrite the source of truth
without a Coordinator decision. The current provider run is persisted as
`provider='ai_metadata'` with normalized results and field-level suggestions in
the existing `analysis.metadata_suggestion` table. Matching active taxonomy
terms are added as suggested `catalog.track_term_assignment` rows; unknown terms
stay as metadata suggestions rather than creating new taxonomy records.

## Production configuration

Run the app and worker as separate processes with the same PostgreSQL, storage
and processing configuration. Install FFmpeg and ffprobe on the worker host and
install Node dependencies so Essentia.js is available. Configure
`GEMINI_API_KEY`, `AI_ANALYSIS_MODEL`, `AI_ANALYSIS_FALLBACK_MODELS`,
`AI_ANALYSIS_TIMEOUT_MS`, `ESSENTIA_SAMPLE_RATE_HZ` and
`ESSENTIA_MAX_DURATION_SECONDS` as server-only variables. Schedule
reconciliation and cleanup. Monitor structured job records without tokens,
signed URLs or raw audio.
