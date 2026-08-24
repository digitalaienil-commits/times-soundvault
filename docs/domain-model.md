# Audio, catalog and submission domain

## Relationship model

```text
catalog.composition (underlying musical work)
        |
        | optional
        v
catalog.track (stable sound recording)
        |--- parent_track_id ---> catalog.track (cut-down/remix/alternate)
        |
        v
workflow.submission --- optional ---> workflow.submission_batch
        |
        v
workflow.submission_revision (immutable after submission)
        |                   |
        |                   +----> rights.rights_declaration
        v
catalog.audio_asset (one master + many stems per revision)
        |
        v
catalog.audio_file (source/preview/analysis encoding)

catalog.track
        |----> catalog.track_metadata (canonical searchable values)
        +----> catalog.track_term_assignment ---> catalog.taxonomy_term
        +----> published_revision_id (approved revision selected for publication)
```

## Composition and Track

A Composition is the underlying musical work. A Track is the stable identity of
a sound recording/master. Their relationship is optional while metadata is
incomplete. ISWC and ISRC are optional identifiers; neither is a primary key and
SoundVault never manufactures one.

Alternate mixes, instrumentals, remixes and cut-downs are separate child Tracks.
They are not stems. Stems are logical Audio Assets attached to one Track and one
Submission Revision, and the database enforces that both point to the same
workflow item.

## Submission and Revision

A Submission belongs to an explicit owner and references one Track. A batch can
group future bulk intake, but is optional. Every resubmission creates the next
Revision number. Submitted metadata snapshots remain intact; a later Revision
coexists with, then supersedes, the earlier submitted snapshot.

## Audio Asset and Audio File

An Audio Asset is a logical master or stem. A partial unique index permits one
master per Revision and multiple normalized stem types. An Audio File is a
physical encoding. Section 4 registers it as pending and marks it available
only after private storage verifies the expected byte size and WAV/MP3
signature. Section 5 may add technical analysis without rewriting the original
upload record. Checksums are indexed for duplicate discovery but intentionally
are not globally unique.

## Taxonomy and rights

Taxonomy assignments retain source, confidence and review state. Only accepted
canonical assignments will power normal Library filters. A Rights Declaration
belongs to one Revision and permits unknown values. It records declarations; it
does not claim copyright verification or infer Content ID eligibility.

## Publication

Submission approval and publication are separate. Normal Library queries
explicitly select only `catalog.track.publication_status = 'published'`. A
published Track points to a Revision belonging to that same Track. Withdrawal
or archival does not rewrite submission history.
