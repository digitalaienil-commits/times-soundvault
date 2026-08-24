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

`COPYRIGHT_PROVIDER=manual_youtube` is honest manual mode. SoundVault does not
upload to YouTube, query a video, retrieve claims, resolve a claim, deliver a
reference, submit a dispute or request a takedown. A strict 11-character video
ID is stored as human evidence; the server never fetches the corresponding URL.

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
the Submission lifecycle. Observations retain human, time, method, check round,
Revision and Track provenance. Corrections insert a superseding observation;
they never overwrite the earlier record.

YouTube Content ID/CMS automation is not connected or live-tested. Section 6
uses a manual operational workflow and is API-ready.
