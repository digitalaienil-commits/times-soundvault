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
