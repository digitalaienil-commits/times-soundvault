# Catalog metadata and provenance

## Sources

SoundVault keeps four metadata sources distinct:

1. Coordinator-approved canonical catalog metadata;
2. Producer metadata stored on a Submission Revision;
3. embedded file metadata stored on the same immutable Revision snapshot;
4. future AI suggestions stored by provider-run records in Section 5.

Provider output never overwrites human metadata and never becomes the catalog
source of truth directly. Raw Cyanite payloads do not belong in
`producer_metadata`, `embedded_metadata` or required catalog columns.

`catalog.track_metadata` contains the current approved searchable values, with
nullable BPM, key, time signature, normalized scores, vocal state, language,
era and caption. Score constraints are `0.0` through `1.0`; BPM is greater than
zero and no more than 400.

## Taxonomy

The controlled taxonomy supports genre, subgenre, mood, instrument, theme,
festival, use case, character, movement, era, format, geographic genre and
geographic subgenre. Terms are not seeded with invented business data.

Every Track assignment retains:

- source: Producer, embedded, AI, Coordinator or system;
- review state: suggested, accepted or rejected;
- optional confidence from `0.0` through `1.0`;
- optional source Revision and assigning user.

## Identifiers

SoundVault uses internal UUIDs for domain identity. Composition identifiers can
be ISWC, legacy or custom. Track identifiers can be ISRC, legacy or custom.
ISRC input is uppercased and stripped of presentation spaces/hyphens, then
validated as a 12-character recording code. ISWC is optional. Neither external
identifier is fabricated or used as a database primary key.
