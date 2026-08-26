# Professional player and downloads

Section 10 adds a workspace-level audio player to the Published Library. It
survives client-side workspace navigation, uses one HTML audio element, never
autoplays, and exposes labelled keyboard-operable play, pause, previous, next,
seek, mute, volume, queue and close controls.

The visible Library result page is the temporary queue. Starting a result loads
its generated Master preview; next and previous follow the current result
order. A Track detail page can audition the Master or one Stem at a time. This
is not a simultaneous multitrack mixer.

All four roles retain `library.read`, `audio.listen` and `audio.download`.
Every descriptor, preview, source and package request authenticates again and
requires the Track to be published with the requested Audio Asset attached to
its current published Revision. Withdrawal immediately makes those routes
unavailable.

Individual downloads return the immutable source object. **All Stems** and
**Full Package** are durable ZIP jobs with safe deterministic entry names,
STORE compression, ZIP64, mode 0644, a stable publication timestamp and a
manifest containing only delivery-safe names, roles, sizes and checksums.
Packages expire after 24 hours by default.
