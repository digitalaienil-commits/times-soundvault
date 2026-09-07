# YouTube copyright workflow

## Current manual mode

```text
SoundVault
  -> prepare a private Master-only test batch and manifest
  -> Coordinator/Admin downloads the operational MP4
  -> human uploads privately to the approved YouTube/CMS account
  -> human checks YouTube Studio or Content Manager
  -> human records observations in SoundVault
  -> SoundVault retains revision-bound status and audit history
```

## Content ID automation mode

```text
SoundVault
  -> prepare a private Master-only test batch and manifest
  -> if COPYRIGHT_PROVIDER=youtube_content_id:
     -> upload batch MP4 to dedicated private test channel via YouTube Data API
     -> poll YouTube Partner API (claims.list) for Content ID claims
     -> correlate detected claims to batch items by timecode window
     -> insert append-only copyright observations (content_id_claim or no_claim)
     -> delete temporary test video from private test channel
  -> Coordinator/Admin can review findings, override, or supersede observations
  -> SoundVault retains revision-bound status and complete audit history
```

`COPYRIGHT_PROVIDER=youtube_content_id` enables automated Content ID checking:

- In dry-run mode (`YOUTUBE_CONTENT_ID_DRY_RUN=true`), safe offline simulation runs without network calls or billing.
- In live mode (`YOUTUBE_CONTENT_ID_DRY_RUN=false`), server-side OAuth2 credentials (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, `YOUTUBE_CONTENT_OWNER_ID`) are used to scan private test uploads and query partner claims.

No claim observed means: “No Content ID claim was observed on this test upload.
This does not prove copyright ownership or guarantee that future claims will
not appear.” It is never described as copyright clearance.

A Content ID claim and a copyright strike are different. A claim represents a
Content ID match and may apply monetize, track or block policy. A strike relates
to a copyright removal request. Strike entry requires explicit confirmation, a
note and an observation date and writes a high-severity audit event.

## State and evidence

The copyright axis can be awaiting technical processing, ready, packaging,
awaiting manual upload/review, completed, failed or cancelled without changing
the Submission lifecycle. Observations retain human or automated system, time,
method, check round, Revision and Track provenance. Corrections insert a
superseding observation; they never overwrite the earlier record.
