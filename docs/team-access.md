# Team access

## Admin workflow

`/team` is the real Section 2 operational UI. Admin can search and filter the
directory, add one pending assignment, change its single role, suspend or
reactivate access and inspect recent safe audit history. Adding a member sends
no email; it authorises that exact company identity for a future sign-in.

Role changes and suspension use focus-trapping confirmation dialogs. The server
still revalidates session, permission, IDs, role and confirmation state. A
transaction locks team access, applies the change, updates the Better Auth user
role where bound, writes audit events and revokes target sessions.

## Status lifecycle

```text
Pending -> Active (first verified provider binding)
Active -> Suspended (Admin action; sessions revoked)
Suspended -> Active (bound identity) or Pending (not yet bound)
```

Suspension preserves provider identity and audit history. Permanent deletion,
impersonation, password setting, bulk import and public invitations are outside
this section.

## Final Admin protection

Before demoting or suspending an active Admin, the transaction takes a table
lock and counts active Admin assignments. The final active Admin operation is
rejected. Concurrent demotions serialize, so two requests cannot remove every
management route.

## Audit events

`auth.access_audit_event` records team member addition, identity activation,
role change, suspension, reactivation, session revocation and bootstrap Admin
assignment. It contains actor/target IDs, safe before/after values, timestamp
and request/correlation ID. It never stores credentials, tokens, cookies or
provider payloads.

## Operational commands

```bash
pnpm auth:bootstrap-admin -- --email admin@company.example
pnpm auth:list-team
pnpm auth:seed-local
```

Bootstrap is idempotent and creates a pending Admin assignment without
credentials. The local seed creates one active identity per role through
supported Better Auth APIs and never prints passwords. Both refuse unsafe
production/local-mode combinations.
