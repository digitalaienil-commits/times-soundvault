# Producer and Coordinator upload workspace

## Product flow

`/upload` is a four-step workspace: add files, organize Tracks, optionally add
metadata, then review and transfer. WAV and MP3 are accepted. One Track package
must have exactly one Master and may have ordered Stems. Filename suggestions
are editable; ambiguous files remain unassigned, and instrumental full mixes
remain separate Tracks.

Saving creates a transactional batch, Track, draft Submission, Revision 1,
assets, files, rights declaration and Upload Sessions. Optional metadata may be
unknown. The acknowledgement records authority to submit for internal review;
it is not proof of ownership or copyright clearance.

## Recovery and ownership

The browser transfers at most three files concurrently. Local chunks are sent
in sequential ranges. A refresh cannot preserve browser file handles, so the
owner reselects files with the exact original name and byte size; transfer then
continues from the server-confirmed offset. Offline events pause active work.
Failed files can retry independently, and completed sibling Tracks remain
intact.

Music Producer mutates owned drafts only. Coordinator mutates owned drafts and
may read other team submissions without draft controls. Admin may inspect,
resume, edit and submit any draft without changing its recorded owner. User is
denied by navigation, route policy and server object checks.

## Submission gate

`Submit for Processing` is enabled only after every registered file is received
and the acknowledgement is present. Submission locks Revision 1 against silent
metadata changes and appends a workflow event. It does not run Cyanite, FFmpeg,
YouTube checks, review, approval or publication.

## Operational checks

```bash
pnpm domain:status
pnpm storage:verify
pnpm uploads:cleanup
```

Cleanup is a dry run unless `--confirm` is supplied. It is restricted to
cancelled or expired sessions on draft submissions.
