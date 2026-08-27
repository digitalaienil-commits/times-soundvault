# Admin Operations

Section 12 adds an Admin-only operational workspace over the systems already
implemented in Sections 2 through 11. It exposes real PostgreSQL counts,
configuration checks, worker queue views, durable maintenance-job requests and
append-only audit events.

Admin Operations provides operational control over the systems already built;
it does not bypass the underlying business workflows or security invariants.

## Boundaries

- `/admin` and every `/admin/*` route requires server-side Admin permission.
- Admin navigation remains grouped inside the Admin workspace.
- The UI can inspect operational records and queue bounded maintenance jobs.
- The UI cannot run arbitrary shell commands.
- Submission approval, rejection, publication and copyright observations still
  use their original domain workflows.
- Section 12 does not implement semantic search, similarity search, AI
  generation, or production deployment.

## Operational tables

Migration `0010-admin-operations.sql` adds `system.admin_audit_event`,
`system.maintenance_job`, `system.integrity_finding`,
`system.worker_heartbeat`, taxonomy governance columns and taxonomy aliases.

Maintenance requests record the requester, type, summary, dry-run flag and max
scope. Workers must re-read current state before executing a job.
