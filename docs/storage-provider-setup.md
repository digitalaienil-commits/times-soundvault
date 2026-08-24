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

Run `pnpm storage:verify` to validate configuration. CI uses local storage and
mocked OneDrive HTTP tests; it never calls Microsoft Graph. A live readiness
check requires approved organization credentials, an explicit disposable test
file, verification in the configured drive/root, and cleanup confirmation.

## Limits

Defaults are 2 GiB per file, 20 GiB per batch, 25 Tracks, 32 Stems per Track,
three concurrent transfers and a 30-minute advisory duration. Override only the
server variables documented in `.env.example`; the browser receives a safe
limits DTO, never provider identifiers or credentials.
