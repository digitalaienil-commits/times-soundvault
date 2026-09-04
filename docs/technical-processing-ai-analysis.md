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

Successful technical processing advances the submission to `ready_for_review`
with `ai_status='disabled'` until a provider-neutral AI metadata worker is
enabled. No external provider upload or webhook is required for review.

Run `pnpm processing:worker` for the long-lived worker,
`pnpm processing:once` for one job, `pnpm processing:reconcile` after an outage,
and `pnpm processing:cleanup` for stale private run directories. Workers are
safely restartable because abandoned running jobs become claimable after their
lease expires.

## AI metadata boundary

AI suggestions are stored separately from canonical metadata and remain
Coordinator-reviewable. Suggested genres, moods, instruments, tempo, key,
descriptions and taxonomy assignments must never overwrite the source of truth
without a Coordinator decision.

Future AI analysis should keep provider SDKs server-only, retain bounded raw
results only when operationally necessary, and write normalized metadata through
the existing `analysis.metadata_suggestion` and `catalog.track_term_assignment`
tables.

## Production configuration

Run the app and worker as separate processes with the same PostgreSQL, storage
and processing configuration. Install FFmpeg and ffprobe on the worker host.
Schedule reconciliation and cleanup. Monitor structured job records without
filenames, tokens, signed URLs, or audio.
