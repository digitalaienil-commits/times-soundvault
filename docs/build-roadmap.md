# Build roadmap

- Section 9 — searchable canonical Published Library: complete.
- Section 10 — professional player, Stem auditioning, secure exact-source
  downloads and durable delivery packages: complete after the documented
  quality, migration, FFmpeg, browser and production-build gates pass.
- Section 11 — Demand Sheet, internal music briefs, catalog-first supply,
  governed responses and current-fit acceptance: complete after clean database,
  quality, browser, responsive, accessibility and production-build gates pass.
- Section 12 — Admin Operations, catalog governance, taxonomy administration,
  audit and retention: complete after clean database, quality, browser,
  responsive, accessibility and production-build gates pass.
- Section 13 — Similarity Search & AI Generation: complete after clean database,
  quality, browser, responsive, accessibility and production-build gates pass.

Status is marked complete only after the section’s required checks pass.

1. Foundation & Premium App Shell — complete
2. Authentication, Team Access & Role Model — complete
3. Audio, Catalog & Submission Domain — complete
4. Producer & Coordinator Upload Workspace — complete
5. Technical Processing & Cyanite Analysis — complete
6. YouTube Copyright & Content ID Workflow — complete
7. Coordinator Review Workspace — complete
8. Approval, Changes, Rejection & Publishing — complete
9. Searchable Published Library — complete
10. Professional Player, Stems & Downloads — complete
11. Demand Sheet — complete
12. Admin Operations — complete
13. Similarity Search & AI Generation — complete
14. Production Hardening & Launch — planned

Section 6 adds an independent copyright state axis, human Content ID eligibility
assessment, private Master-only manual-check batches, immutable observations,
durable jobs and a disabled future provider boundary. It deliberately stops
before Section 7 review decisions and Section 8 publication.

Section 7 adds the server-filtered review queue, atomic assignment, secure
review-only audio ranges, revision-bound Coordinator draft, controlled taxonomy
decisions, append-only notes, human checklist and a locked Ready-for-Decision
handoff. The Submission remains `in_review`; Section 8 is the next milestone.

Section 8 adds append-only decisions, canonical promotion, structured change
requests and immutable Revision N+1 resubmission, Admin-only final rejection,
and a separate rights/copyright publication gate. Publish, withdraw and
republish events are preserved. Bulk Approve and Bulk Publish are capped at 25
and roll back as one transaction.

Section 9 adds published-only PostgreSQL full-text, identifier, taxonomy and
technical filters with canonical Track detail.

Section 10 adds durable private playback derivatives, streaming waveforms,
one-at-a-time Master/Stem auditioning, exact source downloads and deterministic
short-lived packages. It does not add a multitrack mixer, playlists, sharing,
external media APIs or archive/delete.

Section 11 adds an internal Demand Sheet for Coordinator/Admin briefs, required
and preferred catalog requirements, Producer-owned private responses,
catalog-first discovery and Demand-linked normal uploads. Acceptance is
transactionally revalidated against the current published Revision and every
Required requirement. It does not add a second catalog search, bypass normal
publication governance, or introduce external notifications, matching APIs or
AI recommendations.

Section 12 adds grouped Admin Operations for system health, team governance
links, taxonomy administration, catalog maintenance, processing/media queues,
copyright inspection, Demand supervision, audit, retention and integrity
findings. It does not bypass approval, publication, copyright, Demand or media
business workflows and does not implement semantic search, similarity search,
AI generation or production deployment.

Section 13 adds canonical embedding representations, pgvector cosine distance
indexing, opt-in semantic search with PostgreSQL lexical hybrid ranking, nearest
published track similarity on Track Detail, and a role-governed AI music
generation workspace (Google Lyria 3 and ElevenLabs) with dry-run mode, private
storage, full provenance, and draft submission entry without publication bypass.
