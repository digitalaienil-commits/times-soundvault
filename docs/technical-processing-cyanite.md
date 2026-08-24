# Technical processing and Cyanite

Section 5 adds a durable PostgreSQL-backed processing boundary after a Revision is submitted. The submission transition, `analysis.revision_analysis` row, and idempotent `revision_processing` job commit together. A separate Node.js worker claims jobs with `FOR UPDATE SKIP LOCKED`, a bounded lease, attempt limits, and exponential retry delay.

```text
Next.js application -> PostgreSQL durable jobs -> Processing worker
                                               -> private storage
                                               -> FFmpeg/ffprobe
                                               -> Cyanite

Cyanite webhook -> signed Next.js endpoint -> PostgreSQL job -> worker fetches V7 result
```

## Technical processing

The worker streams each source into a random mode-0700 run directory outside `public/` and never changes the original. `ffprobe` reads the first audio stream and a bounded tag allowlist. FFmpeg measures integrated loudness, loudness range, true/sample peak, and leading/trailing silence. SHA-256 is streamed. Master and Stem durations use a 250 ms tolerance. QC warnings cover excessive silence, near-full-scale peaks, unusual channel layouts, missing WAV bit depth, possible duplicates, long Masters, and Stem duration mismatch. Fatal tool or source errors keep the submission in `processing`; successful technical processing may advance it to `ready_for_review`.

Run `pnpm processing:worker` for the long-lived worker, `pnpm processing:once` for one job, `pnpm processing:reconcile` after an outage, and `pnpm processing:cleanup` for stale private run directories. Workers are safely restartable because abandoned running jobs become claimable after their lease expires.

## Cyanite

Cyanite is disabled by default. When enabled, only the Master is analyzed. MP3 sources upload directly; WAV sources receive a temporary metadata-free 320 kbps MP3 derivative. Masters over 15 minutes skip provider analysis and retain completed technical results as a partial analysis.

The server-only provider adapter performs an exact `externalId` lookup, `fileUploadRequest`, streaming upload, `libraryTrackCreate`, and V7 result fetch. Provider tokens, presigned upload URLs, and webhook secrets never enter browser code or logs. The webhook verifies the exact raw body with HMAC-SHA512 from `Signature`. Cyanite's `AudioAnalysisV6` completion event is the documented completion signal for V6 and V7. Delivery is deduplicated by payload hash and only enqueues work; the worker fetches the result.

Raw results are bounded and retained with provider/version/run provenance. Normalized genres, subgenres, moods, instruments, tempo, key, time signature, energy, valence, arousal, voice attributes, character, movement, era, caption, free genres, and segment dynamics become suggestions. They never overwrite canonical metadata. Taxonomy assignments are created only for a matching active local term from the explicit map and remain `suggested` with `source_kind='ai'`.

Use `pnpm cyanite:verify` only with real credentials. `pnpm cyanite:reconcile` repairs missing result-fetch work without uploading again.

## Production configuration

Run the app and worker as separate processes with the same PostgreSQL, storage, processing, and server-only Cyanite configuration. Install FFmpeg and ffprobe on the worker host. Expose `/api/webhooks/cyanite` over HTTPS and configure the matching webhook secret in Cyanite. Schedule reconciliation and cleanup. Monitor structured job records without filenames, tokens, signed URLs, or audio.
