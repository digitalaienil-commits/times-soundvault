# Publication governance

The centralized server-only gate requires an approved current Revision and an
append-only approval decision, canonical title and vocal state, exactly one
accepted Format, at least one accepted Use Case, known and unexpired master and
composition rights, and a completed copyright record.

Accepted copyright outcomes are `no_claim_observed`,
`existing_internal_claim` and explicit `not_applicable`. Third-party claims,
ownership conflicts, reference overlap, strikes, inconclusive outcomes, failed
or pending checks block publication. “No claim observed” is a recorded manual
observation, not proof of copyright clearance. Cyanite and future Content ID
eligibility do not gate Section 8 publication.

There is no Admin bypass. Coordinator and Admin may publish a gate-valid
approved Track. Only Admin may withdraw with confirmation and a reason, or
republish a withdrawn Track with a reason after the gate passes again. Library
queries only `publication_status = 'published'`. Bulk Publish processes at most
25 approved unpublished Tracks in one all-or-nothing transaction.

No external provider API is required for Section 8.
