# Times SoundVault

Times SoundVault is the internal Mirchi/Times workspace for music intake,
review, publication and discovery. Section 2 adds PostgreSQL-backed Better Auth,
pre-authorised team access, four server-owned roles and a functional Admin Team
workspace. Audio and submission records begin in Section 3; current workflow
routes intentionally show honest placeholders instead of sample business data.

## Role model

| Role           | Product responsibility                                                     |
| -------------- | -------------------------------------------------------------------------- |
| Admin          | Every workspace capability, including Team access and protected operations |
| Music Producer | Own submissions, upload, published Library and Demand Sheet                |
| Coordinator    | Upload, review, approve, resolve workflow exceptions and manage demand     |
| User           | Search, listen to and download from the published Library only             |

There is no Reviewer role. Navigation is filtered for clarity, but every
protected route and sensitive mutation also checks permission on the server.

## Prerequisites

- Node.js 24.18.1 (see `.nvmrc`)
- pnpm 11.20.0
- PostgreSQL 17 (local Compose is provided, or use an existing PostgreSQL 17
  service and set `DATABASE_URL`)

## Local setup

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm db:up
pnpm auth:setup-local
pnpm auth:migrate
pnpm auth:seed-local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). `auth:setup-local` creates
an ignored `.env.local` with generated local-only credentials and refuses to
overwrite an existing file. It never prints passwords. Developers who do not
use Docker can point `DATABASE_URL` at an existing PostgreSQL 17 database,
create the `auth` schema, and start at `pnpm auth:migrate`.

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
```

Bootstrap creates or updates one pending Admin assignment. It does not create
credentials or send email. On first valid provider sign-in, the exact approved
email is bound to the provider identity in one transaction. `auth:list-team`
prints safe assignment metadata only.

## Routes

| Route                  | Access                                           |
| ---------------------- | ------------------------------------------------ |
| `/sign-in`             | Public authentication entry                      |
| `/auth/error`          | Public safe authentication error                 |
| `/access-not-assigned` | Authenticated identity without active assignment |
| `/access-denied`       | Active identity without route permission         |
| `/library`             | All four roles                                   |
| `/dashboard`           | Admin, Music Producer, Coordinator               |
| `/my-uploads`          | Admin, Music Producer                            |
| `/upload`              | Admin, Music Producer, Coordinator               |
| `/review`              | Admin, Coordinator                               |
| `/demands`             | Admin, Music Producer, Coordinator               |
| `/team`                | Admin                                            |
| `/admin`               | Admin                                            |

`/` sends User directly to Library and the three operational roles to
Dashboard. Generate is intentionally absent from the primary workspace.

## Commands

```bash
pnpm db:up           # start the pinned PostgreSQL 17 Compose service
pnpm db:down         # stop the service without deleting its volume
pnpm db:logs         # follow PostgreSQL logs
pnpm db:reset        # guarded local-only reset; requires confirmation
pnpm dev
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
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

## Brand asset

The shell and authentication screens use the supplied Gaana/Mirchi lockup from
`public/brand/mirchi-logo.svg` without recolouring or changing its proportions.
See [public/brand/README.md](public/brand/README.md).

## Current limitations

- Google and Microsoft modes require real organization credentials and have not
  been live-tested by the repository test suite.
- Audio, catalog, upload processing, analysis, review records, publication,
  playback and downloads are planned work; no fake records are shown.
- Team access sends no invitation email.
- Automated accessibility coverage complements manual keyboard, zoom and
  assistive-technology review.

The next milestone is **Section 3: Audio, Catalog & Submission Domain**. The
complete sequence is in [docs/build-roadmap.md](docs/build-roadmap.md).
