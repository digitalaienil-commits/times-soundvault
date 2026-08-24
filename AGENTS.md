# Times SoundVault repository guidance

## Product rules

Times SoundVault is an internal Times Group audio workspace. The final roles
are `admin`, `music_producer`, `coordinator`, and `user`. Admin can do
everything. Music Producer manages owned submissions. Coordinator reviews and
approves. User only searches, listens, and downloads from the published
Library. There is no Reviewer role.

Navigation is not authorization. Every protected route and sensitive action
checks permissions server-side. Roles are server-owned and may not be accepted
from browser sign-in input. Local authentication never runs in production.
External Producer authentication must not be invented; provider SDKs and
secrets remain server-side and no secret may use a public environment variable.

The Channels concept is prohibited. Do not add related navigation, filters,
badges, models, mock data, counts, or copy.

Composition and Track are separate concepts. Stems are revision-bound Track
assets, while cut-downs, remixes and alternate mixes are child Tracks.
Submitted revisions are never silently overwritten. Producer, embedded, AI and
Coordinator-approved metadata retain their provenance; provider output never
becomes canonical metadata directly. User catalog queries explicitly filter
published Tracks, and Producer submission queries explicitly scope owner.
Workflow, analysis, copyright and publication states remain separate. Never add
fake catalog records.

Copyright uses the manual `manual_youtube` provider until an approved partner
integration exists. Never make a YouTube/Google request, imply CMS connectivity,
or treat a test batch as a Content ID reference. Use “No claim observed”, never
“Copyright Clear”; a Content ID claim is not a copyright strike. Test batches
are Master-only private artifacts available only to Admin and Coordinator.

Upload Sessions are server-owned and object-authorized. Music Producer and
Coordinator can mutate only owned drafts; Admin can operate any draft; User has
no upload access. Coordinator may read team submissions but cannot mutate
another owner. Dynamic routes use exact typed route families, never pathname
prefix authorization.

Keep storage providers behind `src/lib/storage`. Local objects stay outside
`public`, use generated names and `.part` isolation, stream sequential ranges,
verify exact size/signature and complete atomically without overwrite.
OneDrive means a dedicated SharePoint drive/root with app-only Azure identity;
encrypt upload URLs, never add the Graph bearer token to upload-URL PUTs, and
verify the final item independently. Never silently fall back providers.

## Architecture

- `src/app` keeps routes thin and composes features.
- `src/features/<feature>` owns that feature's components, data, and logic.
- `src/components/ui` contains reusable primitives only.
- `src/components/shared` is feature-neutral product UI.
- `src/components/shell` owns the application frame.
- `src/lib`, `src/config`, and `src/types` expose stable cross-cutting logic.
- Shared layers never import features. Features never import other features.
- Use relative imports within one feature and `@/*` across layers.
- Keep provider SDKs behind future server adapters; never import them into UI.
- Never expose secret keys to browser code or public environment variables.

Use Server Components by default. Add `"use client"` only for real browser
state, interactions, or navigation hooks. Keep TypeScript strict, names and
errors human-readable, and route components small.

## UI and behavior

Use semantic design tokens from `globals.css`; do not scatter hardcoded colours.
Maintain WCAG 2.2 AA practices: keyboard operation, visible focus, landmarks,
labelled icon controls, sufficient contrast, and reduced motion. Add tests for
user-visible behavior and both role boundaries. Do not create fake requests,
delays, analytics, or business workflows to fill unfinished sections. Prefer no
new dependency when existing platform or project utilities are sufficient.

When architecture, roles, commands, or token usage changes, update the relevant
README and `docs/` file in the same change.

## Required checks

After changes, run:

```bash
pnpm format
pnpm check
pnpm build
pnpm test:e2e
```

Also perform keyboard and responsive checks for affected user flows.

## Code review rules

Reject role leaks, unauthorised route access, hardcoded colours, inaccessible
icon-only controls, feature-to-feature imports, secret exposure, accidental
Channels concepts, and destructive or accidental file/data deletion. Confirm
both hidden navigation and server-side route enforcement where access differs.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
