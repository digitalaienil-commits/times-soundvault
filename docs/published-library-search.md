# Published Library search contract

The searchable Library remains canonical-only and published-only. Section 10
adds only `playbackStatus` and `masterPlaybackReady` to result rows so the UI
can communicate readiness without exposing waveform peaks, storage keys, file
IDs or provider metadata. Waveform data is fetched only with an authenticated
Track playback descriptor.

Result cards are non-interactive containers with separate title, play and
Master-download controls; they do not nest interactive elements.
