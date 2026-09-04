# Architecture

## Private media delivery

Section 10 keeps routes thin: Library pages compose catalog components, media
repositories own published-revision predicates, storage adapters own provider
I/O, and the workspace shell owns the persistent player. HTTP work never runs
FFmpeg. Durable workers generate versioned previews, waveforms and packages
outside `public/`; browser DTOs contain only safe labels, readiness, peaks and
authenticated application URLs.

## Ownership and dependency direction

| Area                       | Owns                                                    |
| -------------------------- | ------------------------------------------------------- |
| `src/app`                  | Thin routes, metadata, layouts and feature composition  |
| `src/features`             | Feature-specific UI, actions, data and logic            |
| `src/components/ui`        | Reusable primitives                                     |
| `src/components/shared`    | Feature-neutral product components                      |
| `src/components/shell`     | Authenticated frame and role-aware navigation           |
| `src/lib`                  | Auth, database, domain repositories and shared behavior |
| `src/config` / `src/types` | Typed configuration and contracts                       |

Dependencies point toward stable types and utilities. Shared layers never
import features, and one feature never imports another feature. Server
Components remain the default; client boundaries cover actual browser state,
authentication controls, menus, sheets and dialogs.

## Authentication boundary

Better Auth 1.6.29 uses PostgreSQL through the server-only `pg` pool. Its tables
live in the `auth` schema: `user`, `session`, `account`, `verification` and
`rateLimit`. SoundVault adds `team_access`, `access_audit_event` and
`soundvault_migration`. Browser code receives only the safe `CurrentUser` DTO.

Authentication proves provider identity. SoundVault authorization separately
requires an active, exact pre-authorised team assignment. First sign-in binds
the approved email and provider account transactionally. A session hook checks
active access on creation, and every request rechecks current access so a
suspended assignment fails closed even if a cookie remains.

## Authorization boundary

`permissions.ts` is the capability matrix. `route-policy.ts` maps routes to
capabilities independently of `navigation.ts`. Server routes call
`requireRouteAccess`; Server Actions call `requirePermission` and validate
input before parameterized transactional queries. Role changes and access
status changes write audit events and revoke target sessions.

## Runtime shape

Technical audio analysis runs outside the request lifecycle in a durable
worker. The app and worker share PostgreSQL and private storage, while any
future AI credentials remain behind server adapters. See
[Technical processing and AI analysis](technical-processing-ai-analysis.md).

```text
Browser
  -> Next.js route / Server Action
  -> Better Auth database session
  -> SoundVault active team assignment
  -> capability or route policy
  -> feature / PostgreSQL transaction
  -> server-only storage adapter (upload routes only)
```

Demand routes add a `planning` aggregate behind `src/lib/demands`. They reuse
the catalog-search service for published candidates, the shared published media
controls for playback/download and the Upload repository transaction for new
production. Features do not import one another: route composition and stable
server libraries connect these existing systems. Demand decisions never write
catalog metadata or publication state.

Provider secrets, OAuth tokens, password hashes and session tokens never cross
the server boundary. Future audio/AI SDKs remain behind server adapters; they
are not imported into UI modules.

## Admin operations boundary

`src/features/admin` owns the grouped Section 12 Admin workspace UI and Server
Actions. `src/lib/admin` owns diagnostics, taxonomy governance, maintenance
jobs, retention previews and append-only admin audit writes. Admin routes still
use normal route policy and permission checks; navigation is not authorization.

Admin Operations provides operational control over the systems already built;
it does not bypass the underlying business workflows or security invariants.
Maintenance jobs are bounded database records picked up by workers, not shell
commands from the browser. Retention controls are limited to derived artifacts
and never override Microsoft 365 SharePoint/OneDrive retention policies.

## Copyright boundary

`src/lib/copyright` owns manual batch policy, deterministic manifests, private
artifacts, the disabled provider contract and durable job processing. Copyright
checks live in `rights` and remain independent of Submission, technical
analysis and publication state. The worker materializes verified Masters through the
storage adapter and passes explicit arguments to FFmpeg without a shell. Route
Handlers authorize before opening a private artifact and stream it with
`private, no-store` caching.

The `manual_youtube` provider reports `connected: false` and performs no network
operation. UI modules never import a Google or YouTube SDK.

## Coordinator review boundary

`src/lib/review` owns the Section 7 aggregate, transactions, optimistic
concurrency and server-only `ReviewDecisionPacket`. `src/features/review` owns
the queue and review workspace UI. A Review Case belongs to exactly one
Submission Revision. Source metadata stays immutable; Coordinator choices live
in a separate draft with field-level source, actor and timestamp.

Review audio is authorized by object association and Submission state before
the storage adapter opens a bounded byte range. Local paths, storage keys,
OneDrive content URLs and provider credentials never enter the browser DTO.
Ready for Decision locks the review records but leaves the Submission
`in_review`; Section 8 owns business decisions and canonical promotion.

## Domain boundary

Section 3 owns four application schemas without changing the authentication
boundary:

- `catalog`: Compositions, Tracks, recording versions, assets, files, canonical
  metadata and taxonomy;
- `workflow`: Submission batches, Submissions, immutable Revisions, review
  cases, Coordinator drafts, checklist, notes and events;
- `rights`: revision-specific Producer declarations, copyright checks,
  eligibility reviews, observations, manual batches, reference links and jobs;
- `system`: checksummed domain migration history.
- `planning`: Demands, controlled requirements, contributor/reference links,
  private responses and append-only events.

Section 12 extends `system` with admin audit events, maintenance jobs,
integrity findings and worker heartbeats. These records govern operations; they
do not rewrite catalog, workflow, rights or planning history.

Server-only repositories live below `src/lib/domain` and accept an injected
PostgreSQL query boundary. They use fully qualified, parameterized SQL and map
database rows into stable DTOs. Producer reads include `owner_user_id` in SQL;
Library reads include `publication_status = 'published'` in SQL. React routes
compose these operations but do not own SQL. Later processing services can sit
behind typed adapters and job boundaries without merging workflow, analysis,
copyright and publication state.

## Upload and storage boundary

The Upload feature owns browser selection, grouping, optional Producer
metadata, acknowledgement and transfer controls. Route Handlers revalidate the
authenticated user and object owner for every session operation. The browser
receives limits and safe session DTOs only; it never receives filesystem paths,
Graph credentials or reusable provider URLs.

`src/lib/storage` defines one server-only interface with two adapters:

- local storage streams sequential ranges into isolated `.part` objects,
  validates exact bytes and audio signatures, then atomically publishes without
  overwriting an existing object;
- OneDrive uses app-only Azure identity for a configured SharePoint drive/root,
  encrypts upload URLs at rest with AES-256-GCM, sends chunk PUTs without the
  Graph authorization header, follows `nextExpectedRanges`, and independently
  verifies drive, item, parent, name and size on completion.

`workflow.upload_session` is transfer state, while `catalog.audio_file` becomes
available only after provider verification. Neither state implies technical
analysis, copyright clearance, approval or publication.

## Decision and publication boundary

`src/lib/decisions` owns Section 8 transactions. It re-reads and locks the
Review Case, Submission, current Revision and Track, validates `row_version`,
and stores one append-only primary decision. Browser input never supplies
canonical metadata or publication evidence.

Approval promotes reviewed scalar fields and accepted taxonomy, accepts the
current Revision and leaves the Track unpublished. A separate centralized gate
evaluates canonical metadata, rights and the current copyright result before
Library visibility changes. There is no force-publish path. Structured change
requests hand off to the upload feature through route composition; features do
not import one another and decision snapshots exclude provider/storage data.
