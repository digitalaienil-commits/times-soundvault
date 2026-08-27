# Catalog Governance

Catalog Governance is an operational maintenance view over Track records. It is
not a second Library and it is not an arbitrary metadata editor.

Admins can inspect title, publication state, revision pointers and search-index
health. Rebuild or integrity work is queued as a bounded maintenance job, with
larger work handled by workers after they re-read current state.

Normal catalog visibility remains controlled by `publication_status =
'published'`, current published Revision, canonical metadata and the Section 9
search projection.
