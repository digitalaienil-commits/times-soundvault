# Taxonomy Administration

Section 12 lets Admins create, inspect, deactivate and reactivate controlled
taxonomy terms across the existing catalog categories: format, use case, genre,
subgenre, mood, instrument, theme, festival, character, movement, era, geo
genre and geo subgenre.

Taxonomy deactivation preserves historical assignments and only prevents new
selection; historical data is not deleted.

Existing `catalog.taxonomy_term` rows gain description, sort order,
deactivation metadata and updated-by metadata. Optional aliases are stored in
`catalog.taxonomy_term_alias`. The unique `(category, slug)` rule remains the
stable identity for new terms.
