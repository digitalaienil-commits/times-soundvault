# Audit and Retention

Section 12 adds a dedicated append-only Admin audit stream in
`system.admin_audit_event`. It complements existing domain-specific event
tables and does not replace Submission, Demand, Copyright, Team or Publication
history.

Retention controls are intentionally narrow. They can preview and queue cleanup
for derived artifacts such as expired download packages and failed previews.

Derived artifacts may be safely reconciled or cleaned, but source Masters and
Stems are not casually deleted by the Admin UI.

SoundVault does not override Microsoft 365 SharePoint/OneDrive retention
policies.

Any cleanup worker must re-check the current database state before removing a
derived artifact and must leave Masters, Stems, published source files, audit
events and workflow history intact.
