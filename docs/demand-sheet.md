# Demand Sheet

The Demand Sheet is SoundVault's internal planning system for a future need for
one or more audio Tracks. It is deliberately limited to music supply planning:
it is not a generic task manager, sync-licensing CRM, external brief portal or
notification system.

## Roles and visibility

- Admin and Coordinator can create, edit, open, close, cancel, reopen and
  fulfill Demands; manage contributors and references; and review every
  response.
- Music Producer can read non-draft Demands, see when they are assigned, search
  the company catalog, create or link production and manage only their own
  responses.
- User has no Demand Sheet access. Route policy and PostgreSQL queries enforce
  this independently of navigation.

Assignment is planning information, not authorization. Any Music Producer may
respond to an open Demand before its response deadline.

## Brief and requirements

A Demand records requester/team context, a concise project context, brief,
creative and avoid notes, explicit priority, target Track quantity, response
deadline, needed-by date, owner and optional contributors. Audio direction is
structured as asset kind, BPM and duration ranges, vocal state, under-dialogue,
loopable, Stems and ending requirements plus controlled taxonomy.

Taxonomy requirements are either **Required** or **Preferred**. Required terms
must be active when newly selected and block acceptance if absent or later made
inactive. Preferred terms guide creative decisions but never block acceptance.
For music, opening requires meaningful direction and at least one Use Case or
Format. Reference Tracks are currently published internal Tracks used only as
creative direction; they are not fulfillment responses. A withdrawn reference
remains in history but loses playback.

## Catalog-first and new production

Every open Demand puts **Find existing music** before **Create new Track for
this Demand**. The find page translates scalar and Required requirements into
the canonical Section 9 published-catalog filters. Preferred terms remain
visible but are not hard filters, and operators may relax search without
changing the Demand. A response is created only after a person explicitly
chooses **Propose Track**.

New production reuses the normal Upload workspace. The upload shows a compact,
read-only Demand context, and Track, Submission, Revision and working Demand
Response are created in the same PostgreSQL transaction. Processing, copyright,
review, approval and publication remain authoritative; Demand requirements do
not become canonical metadata automatically.

## Lifecycle, dates and fulfillment

Persisted states are `draft`, `open`, `fulfilled`, `closed` and `cancelled`.
Valid transitions are draft to open/cancelled, open to
fulfilled/closed/cancelled, and closed/fulfilled back to open. Cancellation is
terminal and no Demand is deleted.

The response deadline and needed-by value are operational calendar dates, with
response deadline on or before needed-by. An overdue Demand remains open, but
new response creation/submission is rejected from authoritative locked state.
Coordinator can extend its deadline. Overdue, in-progress, partially covered,
ready-to-fulfill and fulfillment-needs-attention are derived, never persisted.

Fulfillment is a deliberate Coordinator/Admin action. It requires at least the
target number of accepted responses whose Track is still published at the
accepted Revision and whose current canonical metadata still passes every
Required requirement. Later withdrawal or a newly published Revision preserves
history and raises attention; it never silently substitutes music or reopens
the Demand.
