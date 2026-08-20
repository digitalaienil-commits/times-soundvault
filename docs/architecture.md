# Architecture

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

```text
Browser
  -> Next.js route / Server Action
  -> Better Auth database session
  -> SoundVault active team assignment
  -> capability or route policy
  -> feature / PostgreSQL transaction
```

Provider secrets, OAuth tokens, password hashes and session tokens never cross
the server boundary. Future audio/provider SDKs remain behind server adapters;
they are not imported into UI modules.

## Domain boundary

Section 3 owns four application schemas without changing the authentication
boundary:

- `catalog`: Compositions, Tracks, recording versions, assets, files, canonical
  metadata and taxonomy;
- `workflow`: Submission batches, Submissions, immutable Revisions and events;
- `rights`: revision-specific Producer rights declarations;
- `system`: checksummed domain migration history.

Server-only repositories live below `src/lib/domain` and accept an injected
PostgreSQL query boundary. They use fully qualified, parameterized SQL and map
database rows into stable DTOs. Producer reads include `owner_user_id` in SQL;
Library reads include `publication_status = 'published'` in SQL. React routes
compose these operations but do not own SQL. Later processing services can sit
behind typed adapters and job boundaries without merging workflow, analysis,
copyright and publication state.
