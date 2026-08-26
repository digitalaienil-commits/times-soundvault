# Media artifacts and workers

Migration `0008-professional-player-downloads.sql` owns the dedicated
`media` schema:

- `media.playback_artifact` links one immutable source and profile version to
  a generated preview and an interleaved `SMALLINT` min/max waveform.
- `media.delivery_job` is the durable queue for preview and package work,
  including bounded attempts, availability, leases and errors.
- `media.download_package` records scope, ordered-source fingerprint,
  generated object metadata, limits, readiness and expiry.

Publication idempotently enqueues the Master and every Stem. `media:worker`
claims jobs with `FOR UPDATE SKIP LOCKED`; `media:once` runs one job;
`media:reconcile` recovers expired leases and fills missing work;
`media:status` reports counts; `media:verify` checks local tools; and
`media:cleanup` is a dry run unless `--apply` is supplied.

Preview profile version 1 uses the first audio stream, `libmp3lame`, 192 kbps
CBR and 48 kHz. Mono and stereo are preserved; sources above two channels are
downmixed only for preview. Metadata is stripped. No normalization, EQ,
compression, trimming, fades, pitch or speed processing is applied.

Waveforms are decoded by FFmpeg to mono 8 kHz signed 16-bit little-endian PCM.
The stdout stream is folded directly into 2,048 min/max bins. Complete PCM and
complete audio are never accumulated in memory.
