# Demand fit governance

Demand fit is a deterministic server-owned comparison performed by
`evaluateTrackAgainstDemand(...)`. React renders its typed result but never
supplies a trusted fit decision.

## Authoritative inputs

Only a currently published Track's canonical SoundVault data is evaluated:

- current published Revision and asset kind;
- accepted, active taxonomy assignments;
- canonical BPM, vocal state, under-dialogue, loopable and ending type;
- current Revision Master duration from technical processing;
- current Revision Stem presence.

AI suggestions, Producer draft metadata, unpublished audio and Preferred terms
never become hidden acceptance evidence.

## Required and Preferred

The evaluator returns required matches/mismatches, preferred
matches/missing values, warnings and `eligibleForAcceptance`. Every specified
scalar and active Required term must match. A Required term that later becomes
inactive is itself a blocker until the Demand is corrected. Missing canonical
metadata fails the related Required rule. Preferred misses are disclosed but
never block propose, shortlist or accept. There is no numeric AI score and no
Admin override.

Acceptance runs the evaluator inside the transaction after locking the Demand,
Response and current publication subject. It additionally requires matching
brief and response row versions and an unchanged submitted published Revision.
Fulfillment repeats the same validation for all accepted candidates.

## Changes after acceptance

Material brief edits are blocked while an accepted response exists. A
fulfilled Demand must first be reopened. If a Track is withdrawn or a different
Revision is published later, the acceptance snapshot and audit history remain;
the Track stops counting as currently valid and the UI reports fulfillment
attention. Coordinator may reopen the Demand and choose a replacement, but the
system never silently swaps music.
