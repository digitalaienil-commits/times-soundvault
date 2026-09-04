# Times SoundVault

Times SoundVault is The Times Group's internal workspace for music intake,
review, publication and discovery. Section 2 provides PostgreSQL-backed Better
Auth, pre-authorised team access, four server-owned roles and a functional Admin
Team workspace. Section 3 adds the persistent Composition, Track, Submission,
Revision, asset, metadata and rights foundation. Section 4 adds real private
WAV/MP3 intake, bulk Track packaging, resumable transfers, technical processing,
optional Cyanite analysis and a manual-first YouTube copyright workflow.

## Role model

| Role           | Product responsibility                                                     |
| -------------- | -------------------------------------------------------------------------- |
| Admin          | Every workspace capability, including Team access and protected operations |
| Music Producer | Own submissions, upload, published Library and Demand Sheet                |
| Coordinator    | Upload, review, prepare decision context and manage demand                 |
| User           | Search, listen to and download from the published Library only             |

There is no Reviewer role. Navigation is filtered for clarity, but every
protected route and sensitive mutation also checks permission on the server.

## Prerequisites

- Node.js 24.18.1 (see `.nvmrc`)
- pnpm 11.20.0
- PostgreSQL 17 (a native service is recommended for low-storage development;
  Compose remains available but is not required)

## Local setup

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm auth:setup-local
# Start native PostgreSQL 17 and create the database/auth schema first.
pnpm auth:migrate
pnpm domain:migrate
pnpm auth:seed-local
pnpm storage:verify
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). `auth:setup-local` creates
an ignored `.env.local` with generated local-only credentials and refuses to
overwrite an existing file. It never prints passwords. Developers who do not
use Docker can point `DATABASE_URL` at an existing PostgreSQL 17 database. The
database role must search `auth` before `public`; create the `auth` schema and
set `search_path` before running `pnpm auth:migrate` and `pnpm domain:migrate`.
For Homebrew, start it with `brew services start postgresql@17`. No Docker
Desktop is needed.

Local authentication exposes four direct role choices for the seeded Admin,
Music Producer, Coordinator and User identities. Every configured credential
stays server-side, there is no Sign Up UI, and the selector is rejected when
`NODE_ENV=production`, the provider is not `local`, or the request origin is not
the exact configured localhost origin. Google Workspace and Microsoft Entra
configuration are documented in
[docs/auth-provider-setup.md](docs/auth-provider-setup.md).

## Authentication operations

```bash
pnpm auth:generate
pnpm auth:migrate
pnpm auth:seed-local
pnpm auth:bootstrap-admin -- --email admin@company.example
pnpm auth:list-team
pnpm domain:migrate
pnpm domain:status
```

Bootstrap creates or updates one pending Admin assignment. It does not create
credentials or send email. On first valid provider sign-in, the exact approved
email is bound to the provider identity in one transaction. `auth:list-team`
prints safe assignment metadata only.

## Routes

| Route                     | Access                                           |
| ------------------------- | ------------------------------------------------ |
| `/sign-in`                | Public authentication entry                      |
| `/auth/error`             | Public safe authentication error                 |
| `/access-not-assigned`    | Authenticated identity without active assignment |
| `/access-denied`          | Active identity without route permission         |
| `/library`                | All four roles                                   |
| `/dashboard`              | Admin, Music Producer, Coordinator               |
| `/my-uploads`             | Admin, Music Producer, Coordinator               |
| `/upload`                 | Admin, Music Producer, Coordinator               |
| `/upload/[batchId]`       | Same route roles; object ownership checked       |
| `/submissions/[id]`       | Role permission plus object read policy          |
| `/review`                 | Admin, Coordinator                               |
| `/review/[submissionId]`  | Admin, Coordinator                               |
| `/copyright`              | Admin, Coordinator                               |
| `/copyright/batches/[id]` | Admin, Coordinator                               |
| `/demands`                | Admin, Music Producer, Coordinator               |
| `/team`                   | Admin                                            |
| `/admin`                  | Admin                                            |
| `/admin/*`                | Admin                                            |

`/` sends User directly to Library and the three operational roles to
Dashboard. Generate is intentionally absent from the primary workspace.

## Commands

```bash
pnpm db:up           # start the pinned PostgreSQL 17 Compose service
pnpm db:down         # stop the service without deleting its volume
pnpm db:logs         # follow PostgreSQL logs
pnpm db:reset        # guarded local-only reset; requires confirmation
pnpm domain:migrate  # apply checksummed catalog/workflow/rights migrations
pnpm domain:status   # report applied, pending or changed domain migrations
pnpm storage:verify  # validate private local or OneDrive configuration
pnpm uploads:cleanup # dry-run expired/cancelled draft cleanup
pnpm processing:worker
pnpm processing:once
pnpm processing:reconcile
pnpm processing:cleanup
pnpm copyright:worker    # build private manual-check test batches
pnpm copyright:once      # process one copyright job
pnpm copyright:reconcile # create missing checks and recover stale jobs
pnpm copyright:cleanup   # remove expired private test artifacts
pnpm copyright:status    # safe database counts; no YouTube request
pnpm catalog:search:status
pnpm catalog:search:rebuild -- --dry-run
pnpm catalog:search:benchmark # rollback-only 10k plan check
pnpm media:worker         # process preview and package jobs continuously
pnpm media:once           # process at most one ready media job
pnpm media:reconcile      # recover leases and enqueue missing previews
pnpm media:cleanup        # dry-run expired package cleanup
pnpm media:status         # safe artifact/job/package counts
pnpm media:verify         # verify FFmpeg, ffprobe, unzip and media config
pnpm dev
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm check
pnpm build
pnpm start
```

GitHub Actions creates an ephemeral PostgreSQL 17 service, migrates an empty
database, runs the PostgreSQL integration suite, seeds the four local roles and
runs the Chromium role/accessibility suite.

## Architecture and security

Better Auth 1.6.29 owns users, credential/provider accounts and database
sessions. SoundVault owns `auth.team_access` and `auth.access_audit_event`.
Provider tokens remain encrypted server-side and never enter the CurrentUser
DTO. Role changes and suspensions are transactional, audited and revoke every
session for the target identity. The final active Admin cannot be demoted or
suspended. See [docs/authentication.md](docs/authentication.md),
[docs/access-control.md](docs/access-control.md) and
[docs/team-access.md](docs/team-access.md).

Application-owned records live in the fully qualified `catalog`, `workflow`,
`rights` and `system` schemas. The migration runner verifies SHA-256 checksums
and refuses changed applied migrations. See
[docs/domain-model.md](docs/domain-model.md),
[docs/catalog-metadata.md](docs/catalog-metadata.md) and
[docs/submission-lifecycle.md](docs/submission-lifecycle.md).

Section 9 uses a PostgreSQL-only, trigger-maintained search projection for
published canonical Tracks. See
[docs/searchable-published-library.md](docs/searchable-published-library.md).

Section 10 adds private versioned playback derivatives, streamed waveform
peaks, a workspace-level player, exact Master/Stem downloads and durable
short-lived ZIP delivery. Every media request independently enforces the
current published Revision. See
[docs/professional-player-downloads.md](docs/professional-player-downloads.md),
[docs/media-artifacts.md](docs/media-artifacts.md) and
[docs/secure-media-delivery.md](docs/secure-media-delivery.md).

Section 11 adds the PostgreSQL-backed Demand Sheet for catalog-first internal
music briefs, governed new production, private Producer responses and explicit
fit-checked fulfillment. It reuses the Section 9 search and Section 10 media
boundary and adds no external notification or matching provider. See
[docs/demand-sheet.md](docs/demand-sheet.md),
[docs/demand-response-workflow.md](docs/demand-response-workflow.md) and
[docs/demand-fit-governance.md](docs/demand-fit-governance.md).

Section 12 adds Admin Operations for system health, team governance links,
taxonomy administration, catalog maintenance, processing/media queues,
copyright inspection, Demand supervision, audit, retention and integrity
findings. Admin Operations provides operational control over the systems
already built; it does not bypass the underlying business workflows or security
invariants. See [docs/admin-operations.md](docs/admin-operations.md),
[docs/team-and-role-management.md](docs/team-and-role-management.md),
[docs/taxonomy-administration.md](docs/taxonomy-administration.md),
[docs/catalog-governance.md](docs/catalog-governance.md),
[docs/system-maintenance.md](docs/system-maintenance.md) and
[docs/audit-and-retention.md](docs/audit-and-retention.md).

Section 13 adds canonical similarity search and role-governed AI audio
generation. Provider credentials remain server-only, dry-run mode is safe for
local development, and saving a generation creates an unpublished draft
Submission from a trusted server-stored preview rather than browser-supplied
audio. See [docs/similarity-search-ai-generation.md](docs/similarity-search-ai-generation.md).

Section 4 storage is behind a server-only adapter. Local development writes
generated object keys beneath an ignored private root, verifies exact size and
WAV/MP3 signatures, and atomically publishes completed files. The OneDrive
adapter targets a dedicated SharePoint drive/root, encrypts resumable upload
URLs with AES-256-GCM, and verifies the final Graph item independently. See
[docs/upload-workspace.md](docs/upload-workspace.md) and
[docs/storage-provider-setup.md](docs/storage-provider-setup.md).

Section 6 keeps copyright state separate from submission, technical analysis
and publication. A durable worker creates a private Master-only MP4 and
timestamp manifest; a Coordinator or Admin uploads it manually to an approved
YouTube account and records only observations they actually verified. The test
batch is never a Content ID reference. See
[docs/youtube-copyright-workflow.md](docs/youtube-copyright-workflow.md),
[docs/content-id-readiness.md](docs/content-id-readiness.md) and
[docs/copyright-operations.md](docs/copyright-operations.md).

## Brand asset

The shell and authentication screens use the supplied Times Group logo from
`public/brand/times-group-logo.png` without recolouring or changing its
proportions. See [public/brand/README.md](public/brand/README.md).

## Current limitations

- Google and Microsoft modes require real organization credentials and have not
  been live-tested by the repository test suite.
- Live OneDrive generated-object upload and range delivery require organization
  credentials; automated coverage uses mocked Microsoft Graph responses.
- YouTube Content ID/CMS automation is not connected or live-tested. Section 6
  uses a manual operational workflow and is API-ready.
- Production deployment is not yet covered by this repository milestone.
- Live AI provider calls require approved Google or ElevenLabs credentials and
  are not executed by the repository test suite.
- The OneDrive adapter is covered with mocked HTTP tests. Live Microsoft Graph
  upload testing requires organization credentials and is not performed in CI.
- Team access sends no invitation email.
- Automated accessibility coverage complements manual keyboard, zoom and
  assistive-technology review.

Section 7, **Coordinator Review Workspace**, is complete. It adds a filtered
operational queue, atomic assignment, secure Master/Stem listening,
source-aware metadata and taxonomy review, human checklist, internal notes and
a locked Ready-for-Decision handoff. It performs no Section 8 business action.
See [the review workspace guide](docs/coordinator-review-workspace.md) and
[metadata provenance guide](docs/review-metadata-provenance.md).

Section 8, **Approval, Changes, Rejection & Publishing**, is complete. Approval
promotes the locked Coordinator Review Draft to canonical metadata but leaves
the Track unpublished. A second governed action evaluates metadata, rights and
copyright before Library visibility changes. Coordinator can recommend
rejection but only Admin can confirm final rejection. No external provider API
is required for Section 8. See [the decision workflow](docs/decision-workflow.md)
and [publication governance](docs/publication-governance.md).
