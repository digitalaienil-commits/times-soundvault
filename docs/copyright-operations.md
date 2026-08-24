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

## Future live integration

IT and the YouTube team must later confirm ENIL Content Manager API entitlement,
Content Owner ID, an approved Google account, OAuth client and redirect URI,
approved scopes, dedicated test channel ID, match-policy IDs if required, and
authorization for automatic reference delivery. Content ID API access is
restricted to eligible YouTube content partners; CMS access alone must not be
treated as API entitlement. OAuth scopes must be requested only when the live
feature exists.

Future-only variables are `YOUTUBE_CONTENT_ID_ENABLED=false`,
`YOUTUBE_CONTENT_OWNER_ID` and `YOUTUBE_TEST_CHANNEL_ID`. Access and refresh
tokens do not belong in environment templates or SoundVault logs.

YouTube Content ID/CMS automation is not connected or live-tested. Section 6
uses a manual operational workflow and is API-ready.
