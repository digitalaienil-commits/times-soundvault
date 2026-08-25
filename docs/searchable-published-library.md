# Searchable published library

Section 9 exposes only Tracks whose current state is `published` and whose
search document points at the same `published_revision_id`. Every result and
detail query repeats that predicate, so a stale index row cannot expose a
withdrawn Track. Search documents contain the public title and description,
canonical metadata, accepted active taxonomy terms and Track identifiers. They
exclude producer drafts, review notes, AI suggestions, rights evidence and
provider/storage details.

Migration `0007-searchable-published-library.sql` enables `pg_trgm`, adds the
`catalog.track_search_document` projection, GIN full-text and trigram indexes,
structured filter indexes and refresh triggers. Title and identifiers use
weight A, accepted taxonomy weight B, and descriptions/editorial metadata
weight C. Search uses `websearch_to_tsquery`, `ts_rank_cd`, exact title and
identifier boosts, prefix/substring boosts and a controlled title-similarity
fallback for queries of at least three characters.

URL query parameters own search, filter, sort and page state. The server
validates lengths, enums, arrays, dates and numeric ranges before issuing only
parameterized SQL. Pagination is 30 rows by default and capped at 60.

Operational commands:

```bash
pnpm catalog:search:status
pnpm catalog:search:rebuild -- --dry-run
pnpm catalog:search:rebuild
pnpm catalog:search:benchmark
```

The benchmark creates 10,000 synthetic published records inside a transaction,
runs `EXPLAIN (ANALYZE, BUFFERS)`, and always rolls back. PostgreSQL remains the
only search engine. Semantic and AI-prompt search are reserved for Section 13;
professional playback and downloads are reserved for Section 10.
