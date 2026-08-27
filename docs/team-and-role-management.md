# Team and Role Management

Team access remains owned by the existing Section 2 Team workspace and
`auth.team_access` table. Section 12 links Admins back to that single path so
role changes, suspension, session revocation and last-active-Admin protection
stay consistent.

## Rules

- Roles are server-owned: `admin`, `music_producer`, `coordinator`, and `user`.
- Browser sign-in input never grants a role.
- Deactivation suspends access; it does not delete identities or audit history.
- Admin demotion and suspension are transactionally blocked when they would
  remove the final active Admin.
- Sessions are revoked after role or status changes.

Historical actor fields remain untouched during ownership or role changes.
