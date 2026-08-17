# Access control

## Roles and capabilities

| Capability area            | Admin | Music Producer | Coordinator | User |
| -------------------------- | :---: | :------------: | :---------: | :--: |
| Published Library          |   ✓   |       ✓        |      ✓      |  ✓   |
| Own submissions            |   ✓   |       ✓        |             |      |
| Upload                     |   ✓   |       ✓        |      ✓      |      |
| Review and approval        |   ✓   |                |      ✓      |      |
| Demand Sheet               |   ✓   |       ✓        |      ✓      |      |
| Team access                |   ✓   |                |             |      |
| Protected Admin operations |   ✓   |                |             |      |

The canonical capabilities are in `src/lib/auth/permissions.ts`. Admin receives
every canonical capability. Music Producer cannot approve, Coordinator cannot
manage Team, and User cannot upload. Unknown and historical roles fail closed.

`src/lib/auth/route-policy.ts` maps each protected route to a capability.
`src/config/navigation.ts` separately decides which links to show. Editing the
navigation cannot expand route access.

## Enforcement

- `proxy.ts` performs the fast unauthenticated redirect and preserves only a
  sanitized internal callback.
- each protected Server Component calls `requireRouteAccess`;
- sensitive Server Actions call `requirePermission` before parsing and writing;
- all mutation input is schema-validated and SQL values are parameterized;
- database role/status checks reject malformed stored data;
- CurrentUser mapping accepts exactly four roles and active assignments.

Access Denied is for active identities lacking a capability. Access Not
Assigned is for identities without a valid active assignment. Neither page
exposes internal permission identifiers or team data.
