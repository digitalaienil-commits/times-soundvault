# Coordinator review workspace

## Workflow boundary

```text
ready_for_review
  -> Coordinator claims the current Revision
  -> Submission becomes in_review
  -> human review and draft preparation
  -> Review Case becomes ready_for_decision
  -> Section 8
```

Section 7 reviews; Section 8 decides. Marking a review Ready for Decision locks
the Coordinator draft, taxonomy decisions and checklist, while the Submission
remains `in_review`. The workspace has no business-decision or publication
operation.

## Assignment and concurrency

One `workflow.review_case` exists per Submission Revision. Starting a review
locks the Submission, creates or reuses that case, atomically claims it and
records both Submission and review events. A released review can be claimed
again. Coordinators edit only their own assignment and inspect other assignments
read-only; Admin can reassign or take over. Every mutation checks `row_version`,
so a stale browser receives a refresh conflict instead of overwriting another
session.

An older `in_review` Submission without a case is reconciled idempotently when
opened. It receives pending checklist state and no fabricated completion.

## Review experience

The queue is filtered and paginated in PostgreSQL, oldest waiting first. Its
summary query shows real assignment, technical, AI, copyright and rights state
without loading raw provider results or full technical detail.

The detail route combines safe normalized data in one server-owned read model:

- secure Master and Stem previews with authenticated byte-range streaming;
- Producer, embedded and AI metadata comparison;
- Coordinator scalar-field and controlled-taxonomy draft;
- verified technical metrics and immutable QC issues;
- declared rights and current manual copyright/Content ID state;
- human checklist and append-only internal notes.

The storage read boundary supports local private objects and a mocked-testable
OneDrive range request. Browser responses are `private, no-store` and never
contain a physical path, storage key, Graph URL or provider token.

## Checklist and handoff

The seven checklist areas are Master audio, Stems, Technical QC, Core metadata,
Editorial metadata, Rights and Copyright. Machine completion never marks an
item Pass. Attention requires a note; Stems may be Not Applicable only when no
stems exist. Music requires explicit review of title, vocal state and format,
plus at least one active Use Case selection.

Ready for Decision does not require AI analysis success, a claim-free copyright
result, Content ID eligibility or all-Pass checklist state. Legitimate attention
items are carried into the stable server-only `ReviewDecisionPacket`. The
assigned Coordinator or Admin may reopen while the current Revision is still
`in_review` and Section 8 has not acted.

## Controlled baseline terms

Migration `0005` seeds only the product-confirmed Section 4 `format` and
`use_case` values with stable migration-owned UUIDs. It deliberately does not
invent genre, mood or instrument vocabulary. Selecting a term records a review
decision; the underlying Producer or AI assignment remains unchanged.

## Locked decision handoff

Ready for Decision exposes exactly Approve, Request Changes and Recommend
Rejection. Each action re-reads the authoritative packet under row locks and
rejects stale versions with: “This review changed before the decision
completed. Refresh and try again.”

Attention items stay visible and require explicit acknowledgement plus a
meaningful approval note. Approval moves the Review Case to `decisioned` and
removes it from the active queue without publishing. Coordinator can recommend
rejection, while only Admin can confirm final rejection or return it as a
structured change request.
