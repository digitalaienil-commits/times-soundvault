# Authentication provider setup

All values in this document are server-only. Never prefix provider credentials,
the Better Auth secret or the database URL with `NEXT_PUBLIC_`.

## Shared values

```dotenv
AUTH_PROVIDER=google
BETTER_AUTH_SECRET=<at-least-32-random-characters>
BETTER_AUTH_URL=https://soundvault.company.example
AUTH_TRUSTED_ORIGINS=https://soundvault.company.example
DATABASE_URL=postgresql://...
```

The base URL and trusted origins are exact origins. Production requires HTTPS;
wildcards, credentials, paths and open callback origins are rejected.

## Google Workspace

```dotenv
AUTH_PROVIDER=google
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_WORKSPACE_DOMAIN=company.example
```

Configure the provider callback URL as
`https://soundvault.company.example/api/auth/callback/google`. The hosted
domain is one exact organization domain, not a wildcard. A Google identity must
still match a pending SoundVault assignment.

## Microsoft Entra ID

```dotenv
AUTH_PROVIDER=microsoft
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=00000000-0000-0000-0000-000000000000
```

Configure the callback URL as
`https://soundvault.company.example/api/auth/callback/microsoft`. The tenant ID
must be one exact UUID. Generic `common`, `organizations` and `consumers`
authorities are rejected.

ENIL should enable **Assignment required** on the Entra Enterprise Application
so only explicitly assigned organization identities can authenticate.

## Local development and CI

```dotenv
AUTH_PROVIDER=local
BETTER_AUTH_URL=http://localhost:3000
AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
LOCAL_ADMIN_NAME=...
LOCAL_ADMIN_EMAIL=...
LOCAL_ADMIN_PASSWORD=...
# repeat for PRODUCER, COORDINATOR and USER
```

Use `pnpm auth:setup-local` to create generated values safely, then migrate and
run `pnpm auth:seed-local`. Local mode is rejected in production and exposes no
Sign Up or password-recovery UI.

## Go-live checklist

1. Apply migrations to an empty staging database.
2. Configure only one provider and exact production origins.
3. Bootstrap the first Admin assignment.
4. Verify a fresh real organization account sign-in and active Team binding.
5. Verify wrong-domain/unassigned identities fail closed.
6. Confirm secrets and OAuth tokens never appear in browser payloads or logs.

Repository tests validate configuration and callbacks. They do not constitute a
live Google or Microsoft OAuth test without real tenant credentials.

Future external Music Producers require an approved identity decision such as
Entra B2B guests, managed Google identities or a later invitation-only method.
This section deliberately does not open public email/password access.
