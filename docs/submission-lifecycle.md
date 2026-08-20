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
