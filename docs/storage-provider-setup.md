# Upload storage provider setup

## Private local storage

Use local storage for development and CI:

```text
STORAGE_PROVIDER=local
LOCAL_STORAGE_ROOT=.soundvault-storage
```

The root is resolved to an absolute server path and is rejected if it is inside
`public`. The directory is ignored by Git. Run `pnpm storage:verify` before the
app. Generated UUID object names prevent original filenames from becoming
paths. Partial objects are private `.part` files; completion validates size and
signature and atomically publishes without replacing an existing object.

## SharePoint / OneDrive

Production OneDrive mode targets a dedicated SharePoint document-library drive
and a configured root item. Register an application in the organization tenant,
grant the minimum application permission approved by administrators, and store
all values as server-only secrets:

```text
STORAGE_PROVIDER=onedrive
STORAGE_SESSION_ENCRYPTION_KEY=<base64 encoded 32-byte key>
ONEDRIVE_TENANT_ID=<tenant UUID>
ONEDRIVE_CLIENT_ID=<application UUID>
ONEDRIVE_CLIENT_SECRET=<secret value>
ONEDRIVE_SITE_ID=<Graph site ID>
ONEDRIVE_DRIVE_ID=<dedicated document-library drive ID>
ONEDRIVE_ROOT_ITEM_ID=<dedicated folder item ID>
```

Generate the encryption key outside the repository and rotate it through a
planned key-version migration. Never use `NEXT_PUBLIC_` for storage values.
The adapter uses `@azure/identity` app-only tokens only for Graph control-plane
requests. Resumable upload URLs are bearer capabilities: they are encrypted at
rest, never logged or returned in DTOs, and upload PUTs intentionally omit the
Graph `Authorization` header.

## Finding the SharePoint identifiers

An Azure app registration gives you the tenant, client and secret. It does not
tell you which document library the app should own, and those identifiers are
opaque. After pasting the three app-registration values, run:

```bash
pnpm storage:discover -- --search soundvault
pnpm storage:discover -- --site contoso.sharepoint.com:/sites/SoundVault
pnpm storage:discover -- --site contoso.sharepoint.com:/sites/SoundVault --folder SoundVault
```

The first form finds candidate sites, the second lists the document libraries
on one site, and `--folder` resolves a folder inside a library so uploads land
somewhere dedicated rather than at the library root. Each form prints the
`ONEDRIVE_*` values ready to paste. It reads only, writes nothing, and never
prints a secret.

`ONEDRIVE_SITE_ID` is recorded for operators; every Graph call the adapter makes
addresses the drive directly.

## Required Graph permission

The app registration needs an **application** permission for Microsoft Graph
with tenant admin consent granted — `Files.ReadWrite.All`, or `Sites.Selected`
plus a write grant on the specific site, which is the tighter option. Delegated
permissions do not apply: uploads and both operator scripts run as the
application, with no signed-in user.

An app registration with no permissions at all is still issued a valid token,
so the credentials look correct and every call fails with `401 General
exception while processing` — a message that names neither the cause nor the
fix. Both scripts therefore read the granted permissions out of the token and
report them at sign-in, and on an authorization failure with nothing granted
they print what the administrator has to do. Getting a token is not evidence of
access.

Under `Sites.Selected` the app can see only the site it was granted, so
`storage:discover --search` returns nothing useful; address the site directly
with `--site`. `--search` needs `Sites.Read.All`.

Run `pnpm storage:verify` to validate configuration. `storage:verify` acquires an application token, reads the drive and reads the
root folder, so a wrong secret, missing admin consent or unreachable drive
fails loudly instead of at the first upload. It creates nothing; write access
is proven only by a real upload. Pass `--offline` to check shape alone.

## Reading the library without the application

Storage keys are generated UUIDs so a producer's filename can never become a
path, which leaves the document library showing nothing but identifiers. The
Track name, part, revision, producer and original filename are therefore
written to the file's SharePoint `Title` and description columns, beside the
file and never part of the key.

New uploads are labelled as they complete, and the attempt cannot fail the
upload: an object that reached storage intact has succeeded, and a missing
label is cosmetic. To label everything stored earlier, or to repair labels
after Tracks are retitled:

```bash
pnpm storage:describe
```

It is idempotent — labels are rebuilt from the catalogue on every run.

Add the **Title** column to the library view in SharePoint to see them; the
built-in columns are used because creating custom ones needs
`Sites.Manage.All`, which uploads do not require.

## Checking the store against the catalogue

The database and the document library can disagree in both directions, and
neither shows in the application: an upload that failed part-way leaves a row
pointing at an object that never finished, and an operator script can leave an
object no row references.

```bash
pnpm storage:audit
```

It reports objects with no catalogue row, rows with no object, stored files
missing their Title label, and size mismatches. It reads only; removing
anything is a separate deliberate act. A row whose object is missing on a
**draft** submission is an abandoned upload rather than damage and is reported
without failing the check; the same on a submitted Track is marked and fails.

## Moving existing objects after a switch

Changing `STORAGE_PROVIDER` decides where new objects are written and nothing
about where existing ones are. Every audio row records its own
`storage_backend` and the application reads both, so a switch never strands a
file. Consolidating the catalogue onto one provider is separate housekeeping:

```bash
pnpm storage:migrate            # dry run: reports what would move
pnpm storage:migrate -- --apply
```

Each object is copied, read back off the new provider and hashed against the
original before its row is repointed; a successful upload call is not evidence
that what landed is what left. Rows are updated one transaction per object, so
an interrupted run leaves a consistent mix rather than a broken one, and
re-running resumes.

Local copies are never deleted. Reversing a bad migration has to stay possible,
and reclaiming the disk is a deliberate separate act once the catalogue has
been checked.

CI uses local storage and mocked OneDrive HTTP tests; it never calls Microsoft
Graph. A live readiness
check requires approved organization credentials, an explicit disposable test
file, verification in the configured drive/root, and cleanup confirmation.

## Limits

Defaults are 2 GiB per file, 20 GiB per batch, 25 Tracks, 32 Stems per Track,
three concurrent transfers and a 30-minute advisory duration. Override only the
server variables documented in `.env.example`; the browser receives a safe
limits DTO, never provider identifiers or credentials.
