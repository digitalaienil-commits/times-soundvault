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
        |                   +----> rights.copyright_check (historical rounds)
        |                                |----> eligibility reviews
        |                                |----> immutable observations
        |                                +----> manual batch items
        v
catalog.audio_asset (one master + many stems per revision)
        |
        v
catalog.audio_file (source/preview/analysis encoding)

catalog.track
        |----> catalog.track_metadata (canonical searchable values)
        +----> catalog.track_term_assignment ---> catalog.taxonomy_term
        +----> published_revision_id (approved revision selected for publication)

planning.demand
        |----> planning.demand_term_requirement ---> catalog.taxonomy_term
        |----> planning.demand_assignee -----------> auth.user
        |----> planning.demand_reference_track ----> catalog.track
        |----> planning.demand_response ------------> catalog.track
        |                         +------------------> workflow.submission (optional)
        +----> planning.demand_event (append-only)

system.maintenance_job
        |----> bounded admin worker request
system.integrity_finding
        |----> durable governance issue
system.admin_audit_event (append-only)
        |----> admin operation history
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

Each submitted current Revision receives one current copyright check. A recheck
creates another numbered round and preserves the prior check and observations.
Copyright status never changes the Submission lifecycle automatically.

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

Section 7 adds one `workflow.review_case` per reviewed Revision, with a separate
metadata draft, controlled-term selections, checklist, append-only notes and
events. These proposed values never update `catalog.track_metadata`, accept a
taxonomy assignment or change publication state. Section 8 consumes the locked
`ReviewDecisionPacket` and performs any approved promotion transactionally.

Section 8 adds append-only `workflow.review_decision` primary decisions and
Admin resolutions, Producer-visible `workflow.change_request` records with
structured items, and append-only `catalog.track_publication_event` history.
The bounded decision snapshot excludes storage and provider secrets.
`decisioned` is terminal for that reviewed Revision; `superseded` continues to
mean a newer Revision replaced it.

## Demand planning

A Demand is a future internal need, not a Track or Submission state. Its five
persisted lifecycle values remain separate from derived deadline and coverage
conditions. Requirements reference the existing canonical taxonomy; references
and responses point to stable Tracks. A submission-origin response additionally
points to a Submission whose Track is enforced by a database trigger.

Responses snapshot both Demand brief version and published Revision. Accepted
responses count only while the exact Revision remains published and current
canonical fields pass the centralized Required fit evaluation. Demand
shortlisting, acceptance and fulfillment never mutate Track metadata,
Submission state or publication.

## Admin operations

Admin Operations adds no new business lifecycle. It observes and governs the
existing catalog, workflow, rights, media, analysis and planning aggregates.
Taxonomy deactivation preserves historical assignments and only prevents new
selection; historical data is not deleted. Derived artifacts may be safely
reconciled or cleaned, but source Masters and Stems are not casually deleted by
the Admin UI.
