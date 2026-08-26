# Demand response workflow

A Demand Response connects one Demand to one Track. `(demand_id, track_id)` is
unique, and a database trigger proves that a linked Submission belongs to the
same Track.

## Origins and states

- `catalog` starts as `submitted` with a currently published company Track.
- `submission` starts as `working` and references a normal owned, non-archived,
  non-rejected Submission. It can become `submitted` only after its Track is
  published.

The complete response state set is `working`, `submitted`, `shortlisted`,
`accepted`, `declined` and `withdrawn`. Submission processing/review states are
read from `workflow.submission`; they are never duplicated on the response.

A responder may withdraw their own working, submitted or shortlisted response.
Coordinator/Admin may shortlist submitted responses, decline a submitted or
shortlisted response with Producer-visible feedback, restore a declined
response after refreshing its snapshots, accept an eligible response, or move
an accepted response back to shortlisted while the Demand is open. Demand
decisions never mutate the Track, Submission or canonical metadata.

## Version provenance

`brief_version_started` captures the brief at response creation.
`brief_version_submitted` captures the version the responder confirmed. Any
material change after opening increments the Demand brief version. An older
response is derived as **Brief updated** and cannot be accepted until its owner
refreshes it.

Submission also snapshots `catalog.track.published_revision_id`. Acceptance
requires the submitted Revision to remain the current published Revision and
stores that same value as `accepted_published_revision_id`. A later revision is
derived as **Track changed**; it is never adopted silently.

## Privacy and audit

Music Producer queries return only their own response records, pitch,
Coordinator-visible outcome and decline reason. They receive overall coverage
counts but no other Producer's attribution, pitch, evaluation or response
event. Coordinator and Admin see all responses. Duplicate proposals report
only that the Track already exists on the Demand.

Every lifecycle change appends a bounded event to
`planning.demand_event`. Events cannot be updated or deleted. Demand and
response mutations lock authoritative rows and require current `row_version`
values so concurrent decisions cannot overwrite one another.
