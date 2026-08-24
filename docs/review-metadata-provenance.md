# Review metadata provenance

SoundVault keeps five metadata layers distinct:

1. **Producer metadata** is the immutable snapshot submitted with a Revision.
2. **Embedded metadata** is the submitted or technically verified file-tag
   source and is never rewritten by review.
3. **AI suggestions** are normalized Cyanite suggestions. They remain
   suggestions even when selected by a Coordinator.
4. **Coordinator review draft** is a revision-bound proposal. Every reviewed
   scalar stores value, source kind, optional source reference, reviewer,
   timestamp and explicit reviewed state.
5. **Canonical catalog metadata** is published/searchable and is not modified
   by Section 7.

Selecting Producer, embedded or AI data copies the validated value and its
provenance into the review draft; it does not mutate the source. A Coordinator
override is labelled and attributed as its own source. Missing optional values
remain missing—review does not manufacture metadata.

Controlled taxonomy follows the same rule. Review selections and rejections are
stored in `workflow.review_term_selection`; source assignments in
`catalog.track_term_assignment` remain suggested or retain their existing
state. Coordinators may select only an existing active term. Unmapped ideas go
into internal notes rather than silently creating taxonomy.

When the review is Ready for Decision, Section 7 exposes a locked server-only
`ReviewDecisionPacket`. Section 8 must verify the current Revision and review
version, perform the business decision, and only then promote the chosen draft
to canonical metadata in its own transaction.
