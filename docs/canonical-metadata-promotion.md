# Canonical metadata promotion

Approval promotes the exact locked Coordinator Review Draft. The server does
not accept canonical field values from the browser.

In one transaction it:

1. validates title, vocal state, scalar Format, one active selected Format term
   and at least one active selected Use Case;
2. writes Track title and description;
3. upserts reviewed technical/editorial scalar fields and increments the
   canonical metadata version;
4. rejects prior accepted Coordinator taxonomy assignments and accepts the
   current selected active terms for the approved Revision, preserving all
   Producer, embedded and AI sources;
5. records the approval, accepts the Revision, marks the Submission approved
   and the Review Case decisioned.

The Track remains unpublished. Canonical promotion is review governance, not
Library exposure.
