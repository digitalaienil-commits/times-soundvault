# Deployment runbook

Read this together with
[the production environment checklist](production-environment-checklist.md).

## 1. Infrastructure

- Node.js 24 (`.nvmrc`), pnpm 11.20.0.
- PostgreSQL 17 with the `pg_trgm` and `vector` extensions.
- `ffmpeg`, `ffprobe` and `unzip` on the application `PATH`.
- A private object store: a dedicated SharePoint document library, or durable
  private disk outside the web root.
- TLS terminating in front of the app, forwarding the real host so
  `BETTER_AUTH_URL` matches the browser origin exactly.

Application and worker processes are the same image with different commands.

## 2. Database preparation

The migration runner does **not** run as a superuser and cannot create
extensions. A database owner must do this once, before the first deploy:

```sql
CREATE DATABASE soundvault OWNER soundvault_app;
\connect soundvault
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION soundvault_app;
ALTER DATABASE soundvault SET search_path TO auth, public;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;
CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;
```

Skipping the extensions makes `pnpm domain:migrate` fail with
`must be owner of function set_limit`.

## 3. Environment

Populate every applicable variable from the checklist. Then confirm the guards
fire as designed:

- `AUTH_PROVIDER=local` must refuse to start under `NODE_ENV=production`.
- An HTTP origin must be rejected under `NODE_ENV=production`.

## 4. Migrations

```bash
pnpm auth:migrate
pnpm domain:migrate
pnpm domain:status
```

Migrations are checksummed. `domain:status` reports `applied`, `pending` or a
changed-checksum failure. Re-running applied migrations is safe. Never edit an
applied migration file; add a new one.

## 5. First Admin

```bash
pnpm auth:bootstrap-admin -- --email <approved-address>
pnpm auth:list-team
```

The address must be approved by the business. Bootstrap creates one pending
Admin assignment; the identity is bound on first successful provider sign-in,
in one transaction. Confirm that a real organization account can sign in and
becomes `active` before announcing availability.

## 6. Build and start

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

`pnpm build` runs with `NODE_ENV=production`, so it requires a production-shaped
provider configuration. Building with a local `.env.local` fails by design.

## 7. Workers

Run each as its own supervised process:

```bash
pnpm processing:worker
pnpm media:worker
pnpm copyright:worker
pnpm embedding:worker
```

Schedule reconciliation and cleanup:

```bash
pnpm processing:reconcile   # recover expired leases, requeue abandoned work
pnpm media:reconcile
pnpm copyright:reconcile
pnpm embedding:reconcile
pnpm media:cleanup -- --confirm      # expired delivery packages
pnpm copyright:cleanup               # expired private test artifacts
pnpm uploads:cleanup -- --confirm    # cancelled and expired draft sessions
```

Workers claim work under a lease and are safe to run more than one of. On
shutdown, send `SIGTERM` and allow the current job to finish; each worker
closes its connection pool and exits, and an interrupted job returns to the
queue when its lease expires.

For local development `pnpm workers` runs the processing, media and embedding
workers in one terminal. It refuses to run under `NODE_ENV=production`, where
each worker belongs in its own supervised process.

## 7a. Deploying the web application to Vercel

Vercel runs the Next.js application. It does **not** run the workers: they are
long-lived processes that spawn `ffmpeg`, and neither fits a serverless
function. A Vercel deployment therefore needs a second host for the queues, or
uploads are stored and never analysed.

### What runs where

| Part                                               | Vercel | Elsewhere                       |
| -------------------------------------------------- | ------ | ------------------------------- |
| Pages, API routes, auth, review, publication       | yes    |                                 |
| processing / media / copyright / embedding workers | no     | a VM or container with `ffmpeg` |
| PostgreSQL 17 + `pg_trgm` + `vector`               | no     | managed Postgres                |
| Audio objects                                      | no     | SharePoint document library     |

### Before the first deploy

```bash
pnpm deploy:check
```

It parses every configuration file as production against the variables in the
current environment, so a missing secret or a forbidden local-auth setting is
reported before a build rather than as a 500 on a live URL. It contacts nothing
and prints no secret.

### Settings

- **Project settings → Environment Variables**: every server variable from
  `.env.example`. None may use `NEXT_PUBLIC_`.
- `STORAGE_PROVIDER=onedrive` is required. Local storage writes to the function
  filesystem, which is discarded between invocations, so uploaded audio would
  disappear.
- `DATABASE_URL` must be a **pooled** connection string. Each warm instance
  opens its own pool, and instances multiply under load; the pool ceiling drops
  to 3 on Vercel automatically, but a pooler in front of Postgres is what makes
  this safe. `DATABASE_POOL_MAX` overrides the ceiling.
- `BETTER_AUTH_URL` and `AUTH_TRUSTED_ORIGINS` must be the production HTTPS
  origin. Preview deployments get a different hostname on every build, so
  authentication will not work on them unless that hostname is added.
- `vercel.json` pins the region to `bom1` (Mumbai) and raises `maxDuration` for
  the routes that stream audio. Put the database in the same region; a pool
  round-trip across continents costs more than the function does.

### The 4.5 MB request limit

Vercel rejects any request body over 4.5 MB. Uploads are chunked, and
`UPLOAD_CHUNK_BYTES` defaults to 4 MiB so a chunk fits. Raising it above
4.5 MB on Vercel makes every upload fail on its first chunk with a 413;
`deploy:check` refuses that combination. A self-hosted deployment behind its
own proxy can raise it.

A 2 GiB Master is roughly 500 chunk requests at that size. Each one passes
through a function, which is the cost of not exposing the provider's upload URL
to the browser.

### Migrations

Migrations are not run by the build. Run them from an operator machine or a
deploy job that can reach the database directly, before promoting the
deployment:

```bash
pnpm auth:migrate
pnpm domain:migrate
pnpm domain:status
```

The extensions must already exist; see section 2.

## 8. Smoke tests

Run after every deploy, against the production origin:

```bash
pnpm domain:status
pnpm storage:verify
pnpm media:verify
pnpm analysis:verify
pnpm copyright:status
pnpm catalog:search:status
pnpm embedding:status
```

Then, in a browser:

1. Sign in with an approved organization account.
2. Confirm a wrong-domain or unassigned account fails closed.
3. Confirm navigation matches the role for Admin, Music Producer, Coordinator
   and User.
4. Upload one real Track, let processing finish, and confirm technical
   analysis appears.
5. Take it through Coordinator review, Admin approval, then publication as a
   separate action.
6. Confirm the published Track is searchable, plays, and downloads.
7. Confirm a User cannot reach `/upload`, `/review`, `/team` or `/admin`.

`analysis:verify` makes a real Gemini request when `GEMINI_API_KEY` is set and
will consume quota.

## 9. Monitoring and logs

- Health: the smoke commands above are safe to run on a schedule; they make no
  provider calls except `analysis:verify`.
- Queue depth: `pnpm media:status`, `pnpm copyright:status`,
  `pnpm embedding:status`, and the Admin Operations screens.
- Unexpected API failures log `[<scope>] unexpected failure reference=<uuid>`
  with the stack. The browser only ever receives the reference, never the
  message. Alert on the rate of these lines.
- Server-rendered failures surface a Next.js `digest`; the matching stack is in
  the server log.
- Alert on: failed migrations at boot, worker heartbeat gaps, repeated 429s on
  `/api/generation`, growth in `analysis.processing_job` with status `failed`,
  and any `AUTH_PROVIDER=local` startup rejection.
- Logs must not record secrets, resumable upload URLs, storage keys or private
  paths. Resumable upload URLs are encrypted at rest and never enter DTOs.

## 10. Backup and restore

Back up together, so catalog rows and their audio stay consistent:

1. **Database** — `pg_dump --format=custom` on a schedule; verify with
   `pg_restore --list`. This holds the catalog, workflow, rights, review,
   demand and audit history.
2. **Private object storage** — the SharePoint document library or the
   `LOCAL_STORAGE_ROOT` tree. Source audio is immutable, so incremental backup
   is sufficient.
3. **Generated artifacts** — previews, delivery packages and copyright test
   batches under the temp roots are rebuildable and expire on their own. They
   do not need backup; after a restore, run the `*:reconcile` commands to
   regenerate what is missing.

Restore drill: restore the dump into an empty database, point a staging
instance at it with a copy of the object store, run `pnpm domain:status`, then
the smoke tests. Record the elapsed time as the recovery objective.

## 11. Rollback

1. Stop the workers first, then the web processes.
2. Deploy the previous application build.
3. Migrations are forward-only. Do not hand-edit `system.schema_migration`. If
   a release added a migration that must be undone, ship a new migration that
   reverses it and deploy forward.
4. Restart workers and re-run the smoke tests.

Because approval, publication and rejection are append-only, a rollback of code
never silently unpublishes a Track; publication state is data, not code.

## 12. Local runtime data cleanup

`pnpm data:cleanup` prints an inventory and does nothing else. Adding
`-- --confirm` removes disposable runtime records and generated private
artifacts, and restores the controlled taxonomy.

It refuses `NODE_ENV=production` and refuses any database host that is not
localhost. It is a development convenience, never a production procedure: a
production instance is validated against a freshly migrated empty database, not
a cleaned one.
