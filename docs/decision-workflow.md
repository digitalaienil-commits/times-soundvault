# Decision workflow

Section 8 stores one append-only primary decision per Review Case: `approve`,
`request_changes` or `recommend_reject`. A rejection recommendation may have
one append-only Admin resolution: `confirm_reject` or `return_for_changes`.

Every mutation authenticates, checks the named capability, locks the Review
Case and its Submission/Revision/Track, verifies the current Revision, status
and `row_version`, and builds a bounded snapshot from server-side data. A retry
of the same completed action is idempotent; a competing action receives the
stale-review message. Bulk approval sorts and locks at most 25 reviews and rolls
back the entire transaction if one is stale, incomplete or has attention.

Change requests require a Producer summary and at least one categorized item.
Internal rejection notes are never included in the Producer view. A request is
resolved only when its replacement Revision is successfully submitted.

Coordinator can recommend rejection but only Admin can confirm final rejection.
