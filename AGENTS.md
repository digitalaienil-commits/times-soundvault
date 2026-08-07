# Times SoundVault repository guidance

## Product rules

Times SoundVault is an internal Mirchi/Times audio workspace. `admin` users can
eventually manage audio, people, and providers. `reviewer` users are ordinary
internal users who can discover, preview, generate within limits, and download;
they are not approval officers. There is no approval queue.

The Channels concept is prohibited. Do not add related navigation, filters,
badges, models, mock data, counts, or copy.

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
