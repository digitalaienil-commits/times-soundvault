# Submission lifecycle

## Workflow transitions

```text
draft
  -> submitted
  -> processing
  -> ready_for_review
  -> in_review
       |-> approved
       |-> changes_requested -> submitted (new Revision)
       `-> rejection_recommended
              |-> rejected
              `-> changes_requested -> submitted (new Revision)
```

The transition map is centralized in
`src/lib/domain/submissions/lifecycle.ts`. Repository updates include the
expected current status and increment `row_version`; a stale concurrent action
returns a conflict instead of overwriting another decision. Each successful
transition appends a `workflow.submission_event`.

Submitting requires a current draft Revision. Resubmission creates Revision 2
or later; previous submitted snapshots remain stored and become superseded.

## Independent state axes

These states are intentionally separate:

- workflow: draft, submitted, processing, review and decision states;
- metadata analysis: not started, queued, processing, completed or failed;
- copyright: not started, checking, claim/conflict/manual review/resolution or
  failed;
- publication: unpublished, published, withdrawn or archived.

“Published”, “copyright clear”, “Cyanite complete” and “upload complete” are not
Submission statuses. Section 3 defines processing contracts but does not add
provider tables, SDKs or fake provider runs.

Section 4 adds a separate Upload Session state axis: created, uploading, paused,
completed, failed, cancelled or expired. A draft can be submitted only when it
has exactly one Master, every registered Audio File is available, and the
current Revision has the explicit internal-submission acknowledgement.
Cancellation and cleanup never delete submitted content.

## Section 8 decisions

`in_review` reaches exactly one primary outcome for its current Review Case:

- `approve` → Submission `approved`, Revision `accepted`, Review Case
  `decisioned`; Track stays `unpublished`;
- `request_changes` → `changes_requested`; successful immutable Revision N+1
  submission resolves the request and returns to `submitted` processing;
- `recommend_reject` → `rejection_recommended`, which is pending rather than
  final. Admin resolves it with `confirm_reject` → `rejected`, or
  `return_for_changes` → `changes_requested`.

Publication is an independent Track axis:
`unpublished → published → withdrawn → published`. It never changes the
approved Submission status and every transition has an append-only event.
