# System Maintenance

System Maintenance shows on-demand checks for database, storage, media
configuration, search index freshness, Cyanite configuration and the manual
YouTube copyright workflow.

Checks do not expose secrets and do not imply provider connectivity. Cyanite
and OneDrive status are configuration checks unless a future worker records
heartbeat evidence. The copyright provider remains the manual YouTube workflow;
the UI must never claim CMS or Content ID connectivity.

Maintenance requests are written to `system.maintenance_job` with a dry-run
flag and bounded scope.
