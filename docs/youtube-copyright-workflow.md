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

## Obtaining the refresh token

Google issues a refresh token only through an interactive consent, so it cannot
come from a config file:

```bash
pnpm youtube:authorize          # read-only scope, enough to prove the client
pnpm youtube:authorize -- --full  # also requests upload + youtubepartner
```

It runs a throwaway callback server on port 4545 (the dev server holds 3000),
prints a Google URL, and on return prints `YOUTUBE_REFRESH_TOKEN` and the
channel the token can act on. Register
`http://localhost:4545/oauth2callback` as an authorized redirect URI on the
OAuth client first, or Google refuses the request. The script writes nothing:
paste the token into `.env.local` by hand.

`pnpm youtube:verify` re-proves stored credentials against the live API at any
time without another consent screen, and reports whether the `youtubepartner`
scope was granted.

**What this proves and what it does not.** A successful authorization proves
the client id, the client secret, the consent and YouTube Data API access. It
proves nothing about Content ID, which is a separate partner-level capability
on a content owner. Until a real CMS operation succeeds against
`YOUTUBE_CONTENT_OWNER_ID` — followed by cleanup of whatever it created —
`COPYRIGHT_PROVIDER` stays `manual_youtube` and `YOUTUBE_CONTENT_ID_DRY_RUN`
stays `true`.

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
