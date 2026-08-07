# Architecture

## Goals

The Section 1 architecture keeps route composition, product features, reusable
UI, permissions, and future service adapters independently replaceable. It
optimises for explicit dependency direction, server rendering by default, and
a stable mock-session consumer interface that real authentication can replace.

## Folder ownership

| Area                       | Owns                                                      | Must not own                    |
| -------------------------- | --------------------------------------------------------- | ------------------------------- |
| `src/app`                  | Routing, metadata, layouts, feature composition           | Feature logic, provider clients |
| `src/features`             | Feature-specific UI, data, and logic                      | Other features' internals       |
| `src/components/ui`        | Reusable shadcn primitives                                | Product behavior                |
| `src/components/shared`    | Feature-neutral product components                        | Feature imports                 |
| `src/components/shell`     | Sidebar, top bar, responsive navigation                   | Feature imports                 |
| `src/lib`                  | Permissions, session boundary, utilities, future adapters | Route presentation              |
| `src/config` / `src/types` | Typed static configuration and contracts                  | Runtime workflows               |

Dependencies point inward toward stable types, configuration, and utilities.
`src/app` may compose every layer. Shared components cannot import features, and
features use relative imports internally rather than reaching into another
feature. ESLint enforces these high-value constraints.

## Role boundary

`getCurrentUser()` is a server-only, request-time mock session selected by
`DEMO_ROLE`. Its return contract is the boundary that Section 2 authentication
will replace. Request-time rendering prevents a production build from baking a
demo role into static HTML.
Navigation is filtered from one typed configuration, while `canAccessRoute()`
is separately applied in privileged Server Component routes. Hiding a link is
never treated as authorization.

## Server and client components

Layouts, pages, dashboard content, placeholders, and brand asset resolution are
Server Components. Client boundaries are limited to pathname-aware navigation,
the accessible mobile sheet, and the account dropdown. Only the small,
serializable user model crosses into those boundaries.

## Future API boundary

No empty backend or provider service is scaffolded in Section 1. The intended
direction is:

```text
Next.js Web
    ↓
Typed API boundary
    ↓
Future FastAPI service
    ↓
PostgreSQL / object storage / job worker
    ↓
Cyanite / music-generation / SFX providers
```

Provider credentials and calls will remain server-side. Browser components will
never import provider SDKs or receive secret API keys. Data fetching will live
at route/feature boundaries, not inside presentational cards.

## Future persistent audio region

`AppShell` owns the outer frame and content region. A later audio section can
add a persistent player adjacent to `main` without changing route ownership or
pretending that playback exists today.
