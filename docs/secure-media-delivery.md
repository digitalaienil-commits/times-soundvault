# Secure media delivery

Published media uses authenticated Node.js Route Handlers. Provider and storage
identifiers never appear in the browser DTO. Responses are private and
non-cacheable, advertise byte ranges, include a strong checksum ETag, disable
content sniffing and cross-origin use, and stream with backpressure.

GET and HEAD support a single prefix, open-ended or suffix byte range. A valid
range returns 206 and `Content-Range`; an invalid, multiple or unsatisfiable
range returns 416 with the complete length. A matching strong `If-Range`
honours the range; a mismatch returns the full 200 representation. Request
cancellation is passed to local file streams and Microsoft Graph.

Preview responses use `inline`; exact sources and ZIPs use `attachment`.
Filenames discard path segments, controls and reserved characters, enforce a
bounded length, and provide both an ASCII fallback and UTF-8 `filename*`.

Local generated objects live below
`generated/previews/<artifact>.mp3` and
`generated/packages/<package>.zip` under the private storage root. OneDrive
uses app-only Graph requests and verified upload-session results. Neither
provider URL nor secret is returned to a client.
