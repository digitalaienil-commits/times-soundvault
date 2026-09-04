# Similarity search and AI generation

Section 13 adds two separate capabilities: catalog similarity discovery and
role-governed AI audio generation. Both preserve the existing publication and
submission rules.

## Similarity search

Similarity is stored as canonical embedding data attached to published catalog
material. Library search remains PostgreSQL-first: lexical ranking, controlled
metadata filters and publication visibility still decide what can appear. The
similarity layer only adds sound-alike ordering and track-detail suggestions
for records the current user is already allowed to see.

Similarity UI must not expose raw vector distances as business claims. The
product copy should describe these results as sound-alike or similar-feel
recommendations.

## Generation access

Only roles with `generation.create` can open the generation workspace or call
the generation API. Generated audio never publishes directly. Saving a result
creates a normal unpublished draft Submission owned by the actor, so existing
upload, review, decision and publication gates still apply.

The server chooses from configured providers:

- Google Lyria 3 is available only when `GEMINI_API_KEY` exists and supports
  music generation.
- ElevenLabs is available only when `ELEVENLABS_API_KEY` exists and supports
  music plus sound effects.
- Local simulation is available in dry-run mode, or when no live provider is
  configured.

Generation credentials are server-only. Any `NEXT_PUBLIC_` generation key is
rejected at configuration parse time.

## Trusted generated audio boundary

The browser may preview generated audio, but it cannot supply audio bytes for a
draft commit. On generation, the server stores the preview under a private
`generated/previews/<generation-id>` object key and records checksum, byte
size, content type, container format and provider provenance in
`workflow.ai_generation_record`.

When the actor saves the draft, the server reloads that stored object, verifies
the checksum and byte size, copies it into the normal private Submission
revision source path, and marks the generation record as committed. This avoids
trusting client-side base64 audio for catalog records.

## Storage keys

Generated objects are constrained to these private locations:

- `generated/previews/<uuid>.wav|mp3`
- `generated/packages/<uuid>.zip`
- `submissions/<submission-id>/revisions/<number>/<audio-file-id>.wav|mp3`

The same local and OneDrive storage adapters enforce these keys.

## Current limitations

- Live provider calls require approved organization credentials and are not
  executed in CI.
- Dry-run generation is intentionally deterministic enough for local and CI
  verification, but it is not a quality benchmark for provider output.
- Generated drafts are still drafts; they do not bypass review, approval,
  rights, copyright or publication governance.
