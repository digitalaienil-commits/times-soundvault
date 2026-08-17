# Times SoundVault

Times SoundVault is an internal AI-powered audio workspace for the Mirchi and
Times team. It is being built to help internal users find, understand, create,
and manage music and sound assets in one coherent product.

## Section 1

This repository currently contains the project foundation, semantic design
system, responsive application shell, role-aware navigation, honest route
placeholders, a dashboard preview, accessibility baseline, tests, and CI. It
does not include real authentication, audio workflows, backend services,
provider integrations, or fabricated business data.

## Prerequisites

- Node.js 24.18.1 (see `.nvmrc`)
- pnpm 11.20.0

## Setup

```bash
nvm use
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The root route redirects
to the dashboard.

## Demo role

Section 1 uses a server-only mock session. Set one of these values in
`.env.local`, then restart the development server:

```bash
DEMO_ROLE=admin
DEMO_ROLE=reviewer
```

The role is intentionally not public browser configuration. In local
development only, an absent value defaults to Admin. Reviewer sessions do not
receive Upload or Admin navigation and are redirected from direct visits to
those routes. In production, a missing or invalid value falls back to the
lower-privilege Reviewer role.

## Commands

```bash
pnpm dev          # development server
pnpm format       # write formatting
pnpm format:check # verify formatting
pnpm lint         # ESLint and layer restrictions
pnpm typecheck    # strict TypeScript check
pnpm test         # Vitest unit suite
pnpm test:watch   # Vitest watch mode
pnpm test:e2e     # Playwright Chromium suite
pnpm check        # non-browser quality gates
pnpm build        # production build
pnpm start        # serve a production build
```

Install the Playwright browser once on a new machine with
`pnpm exec playwright install chromium`.

## Routes

| Route        | Access          | Current purpose                    |
| ------------ | --------------- | ---------------------------------- |
| `/`          | Everyone        | Redirects to `/dashboard`          |
| `/dashboard` | Admin, Reviewer | Foundation dashboard preview       |
| `/library`   | Admin, Reviewer | Future discovery placeholder       |
| `/generate`  | Admin, Reviewer | Future generation placeholder      |
| `/upload`    | Admin           | Guarded upload placeholder         |
| `/admin`     | Admin           | Guarded administration placeholder |

## Architecture

Routes in `src/app` compose feature modules. Product features live in
`src/features`; product-wide components are separated into `brand`, `shell`,
and `shared`; reusable shadcn primitives live in `components/ui`; and stable
permission and mock-session interfaces live in `src/lib`. ESLint mechanically
prevents shared layers from importing feature modules and prevents features
from using cross-feature alias imports. See
[docs/architecture.md](docs/architecture.md) for the full ownership model.

## Brand asset

The shell uses the supplied Gaana/Mirchi partner lockup from
`public/brand/mirchi-logo.svg`. The original vector colours and aspect ratio are
preserved, with a compact treatment in the mobile top bar and a spacious
stacked Times SoundVault treatment in desktop and sheet navigation. See
[public/brand/README.md](public/brand/README.md).

## Current limitations

- Authentication is a server environment mock, not identity verification.
- Route guards are the Section 1 role foundation, not a complete security model.
- Dashboard content explains future capabilities and contains no live metrics.
- Audio, upload, generation, search, storage, and provider behavior are not
  implemented.
- Automated accessibility tests complement, but do not replace, manual review.

The next planned milestone is **Section 2: Authentication & Access Control**.
The complete sequence is recorded in [docs/build-roadmap.md](docs/build-roadmap.md).
