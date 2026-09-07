# Copyright operations

## Commands

```bash
pnpm copyright:worker
pnpm copyright:once
pnpm copyright:reconcile
pnpm copyright:cleanup
pnpm copyright:status
```

Reconciliation creates one current check for submitted, processing and
ready-for-review Revisions, refreshes technical readiness, recovers expired
leases and requeues abandoned builds. It never infers a YouTube result.
`copyright:status` prints safe aggregate database state and makes no network
request. Cleanup removes expired UUID-keyed private artifacts and clears their
database keys.

Defaults are 20 Tracks, 5,400 seconds, a two-second digital-silence gap, seven
days of retention and one concurrent build. A batch uses only each current
Revision's technically completed Master. FFmpeg creates a neutral 640×360 H.264
video with 320 kbps AAC. It does not normalize, trim, EQ, compress, fade,
speed-change or pitch-change editorial audio. AAC is an operational encoding,
not the catalog Master.

`manifest.json` contains batch ID, purpose, sequence, Submission, Revision,
Track, display title, source SHA-256, start/end/duration and gap duration. It
contains no storage key or private path and is deterministic for the batch.

Artifacts live outside `public/` beneath `COPYRIGHT_TEMP_ROOT`, use UUID
paths and mode-restricted directories, expire, and stream only after an Admin or
Coordinator is reauthenticated and authorized. Responses use attachment,
`private, no-store` and `nosniff` headers. Producers cannot download a batch.

## Content ID integration

`COPYRIGHT_PROVIDER=youtube_content_id` connects the YouTube Content ID automation pipeline.
It supports:

- Resumable video upload of the test batch to a private test channel (`YOUTUBE_TEST_CHANNEL_ID`).
- Content ID Partner API claim polling (`https://www.googleapis.com/youtube/partner/v1/claims`).
- Millisecond-exact timecode matching against batch tracks.
- Automatic cleanup of the temporary test video upon scan completion.
- Safe offline simulation when `YOUTUBE_CONTENT_ID_DRY_RUN=true`.

Required credentials (strictly server-side, never `NEXT_PUBLIC_`):

- `YOUTUBE_CONTENT_OWNER_ID`: ENIL / Times partner Content Owner ID.
- `YOUTUBE_CLIENT_ID`: Google OAuth2 client ID.
- `YOUTUBE_CLIENT_SECRET`: Google OAuth2 client secret.
- `YOUTUBE_REFRESH_TOKEN`: Authorized refresh token with YouTube Partner and Data scopes.
- `YOUTUBE_TEST_CHANNEL_ID`: Dedicated unlisted test channel.
