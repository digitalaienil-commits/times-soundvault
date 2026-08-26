# Catalog search index

The Section 9 `catalog.track_search_document` index is unchanged. Preview and
package readiness live in the `media` schema and are joined at query time.
Media failures never alter publication, canonical metadata or full-text search
documents.
