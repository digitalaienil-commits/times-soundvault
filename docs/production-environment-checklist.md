# Production environment checklist

Every value below is server-side. No production variable may use a
`NEXT_PUBLIC_` prefix; the storage, analysis, copyright, embedding and
generation config parsers throw at startup if one does.

Record each variable as **present**, **absent** or **not applicable**. Never
paste the values into tickets, chat or this file.

## Origin and runtime

| Variable               | Required | Notes                                                          |
| ---------------------- | -------- | -------------------------------------------------------------- |
| `NODE_ENV`             | yes      | Must be `production`. Enables HSTS and disables local auth.    |
| `BETTER_AUTH_URL`      | yes      | Exact HTTPS origin, no path. HTTP is rejected in production.   |
| `AUTH_TRUSTED_ORIGINS` | yes      | Comma-separated exact origins; must include `BETTER_AUTH_URL`. |
| `DATABASE_URL`         | yes      | PostgreSQL 17 with `pg_trgm` and `vector` already installed.   |
| `BETTER_AUTH_SECRET`   | yes      | At least 32 random characters, unique to this deployment.      |

Wildcards, credentials, paths, query strings and fragments in an origin are
rejected at startup.

## Authentication provider — choose exactly one

`AUTH_PROVIDER=local` throws in production and cannot be overridden.

### Google Workspace

| Variable                  | Notes                                       |
| ------------------------- | ------------------------------------------- |
| `AUTH_PROVIDER=google`    |                                             |
| `GOOGLE_CLIENT_ID`        |                                             |
| `GOOGLE_CLIENT_SECRET`    |                                             |
| `GOOGLE_WORKSPACE_DOMAIN` | One exact hosted domain. No `*` and no `@`. |

Callback URL: `https://<production-origin>/api/auth/callback/google`

### Microsoft Entra ID

| Variable                  | Notes                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| `AUTH_PROVIDER=microsoft` |                                                                           |
| `MICROSOFT_CLIENT_ID`     |                                                                           |
| `MICROSOFT_CLIENT_SECRET` |                                                                           |
| `MICROSOFT_TENANT_ID`     | One exact tenant UUID. `common`/`organizations`/`consumers` are rejected. |

Callback URL: `https://<production-origin>/api/auth/callback/microsoft`

Enable **Assignment required** on the Entra Enterprise Application so only
explicitly assigned organization identities can authenticate.

### Local variables

`LOCAL_ADMIN_*`, `LOCAL_PRODUCER_*`, `LOCAL_COORDINATOR_*` and `LOCAL_USER_*`
are **not applicable** in production and must be absent from the production
environment.

## First Admin

The first Admin assignment is created with
`pnpm auth:bootstrap-admin -- --email <approved-address>`. It creates one
pending assignment; it does not create credentials and sends no email. The
email must be an organization address approved by the business — never invented
by an operator or by tooling.

## Private storage

| Variable                         | Required                         |
| -------------------------------- | -------------------------------- |
| `STORAGE_PROVIDER=onedrive`      | yes for production               |
| `STORAGE_SESSION_ENCRYPTION_KEY` | yes — base64-encoded 32 bytes    |
| `ONEDRIVE_TENANT_ID`             | yes                              |
| `ONEDRIVE_CLIENT_ID`             | yes                              |
| `ONEDRIVE_CLIENT_SECRET`         | yes                              |
| `ONEDRIVE_SITE_ID`               | yes                              |
| `ONEDRIVE_DRIVE_ID`              | yes — dedicated document library |
| `ONEDRIVE_ROOT_ITEM_ID`          | yes — dedicated folder item      |

`STORAGE_PROVIDER=local` is acceptable only if the deployment has durable,
backed-up private disk outside the web root. `LOCAL_STORAGE_ROOT` must never
resolve inside `public/`; startup rejects it.

Upload limits (`UPLOAD_MAX_FILE_BYTES`, `UPLOAD_MAX_BATCH_BYTES`,
`UPLOAD_MAX_TRACKS_PER_BATCH`, `UPLOAD_MAX_STEMS_PER_TRACK`,
`UPLOAD_CONCURRENCY`, `UPLOAD_ADVISORY_MAX_DURATION_SECONDS`) fall back to the
documented defaults when absent.

## Media runtime

`ffmpeg`, `ffprobe` and `unzip` must be on the server `PATH`. Verify with
`pnpm media:verify`. Essentia runs in-process and is verified together with
FFmpeg by `pnpm analysis:verify`.

`MEDIA_TEMP_ROOT`, `PROCESSING_TEMP_ROOT` and `COPYRIGHT_TEMP_ROOT` must point
at private, writable paths outside `public/`, on storage that survives restarts
for the retention window.

## AI analysis, embeddings and generation

| Variable                          | Notes                                                          |
| --------------------------------- | -------------------------------------------------------------- |
| `GEMINI_API_KEY`                  | Server-only. Required for live analysis and Gemini embeddings. |
| `AI_ANALYSIS_ENABLED`             | `true` to enable semantic suggestions.                         |
| `AI_ANALYSIS_MODEL`               | Defaults documented in `.env.example`.                         |
| `EMBEDDING_PROVIDER`              | `gemini` or `simulated`.                                       |
| `EMBEDDING_MODEL`                 | Must stay stable; changing it re-embeds the catalog.           |
| `EMBEDDING_DIMENSION`             | Must match the `vector(768)` column unless migrated.           |
| `SEMANTIC_SEARCH_ENABLED`         | Opt-in.                                                        |
| `GENERATION_PROVIDER`             | `google_lyria`, `elevenlabs` or `simulated`.                   |
| `GENERATION_DRY_RUN`              | Anything other than the exact string `false` means dry run.    |
| `MAX_GENERATION_DURATION_SECONDS` | Caps per-request provider cost.                                |
| `ELEVENLABS_API_KEY`              | **Only** if ElevenLabs is an approved provider.                |

Leaving `GENERATION_DRY_RUN` unset is safe: it fails closed to dry run, so a
misconfigured deployment cannot bill a provider.

## YouTube Content ID

Keep `COPYRIGHT_PROVIDER=manual_youtube` until every value below is present and
a disposable, approved live test has succeeded and been cleaned up.

| Variable                     | Notes                                    |
| ---------------------------- | ---------------------------------------- |
| `YOUTUBE_CONTENT_OWNER_ID`   | Approved partner content-owner ID        |
| `YOUTUBE_CLIENT_ID`          | OAuth client                             |
| `YOUTUBE_CLIENT_SECRET`      | OAuth client secret                      |
| `YOUTUBE_REFRESH_TOKEN`      | Authorized YouTube Partner + Data scopes |
| `YOUTUBE_TEST_CHANNEL_ID`    | Dedicated unlisted test channel          |
| `YOUTUBE_CONTENT_ID_DRY_RUN` | Keep `true` until the live test passes   |

A CMS or content-owner ID on its own is not evidence that the integration
works. Do not describe Content ID as connected until a real authorized API
call has succeeded and its test video has been deleted.

## Workers

Processing, media, copyright and embedding workers run as separate processes
(`pnpm processing:worker`, `pnpm media:worker`, `pnpm copyright:worker`,
`pnpm embedding:worker`). Their concurrency, lease and retry variables are
listed in `.env.example`. Leases must exceed the longest expected job.

## Rate limiting

`AUTH_SIGN_IN_RATE_LIMIT_MAX` is ignored in production; the hardened sign-in
budget always applies. Application rate limits for generation, upload sessions
and delivery packages are code-defined in `src/lib/http/rate-limit.ts` and
stored in `system.rate_limit_counter`.
