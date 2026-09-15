import { loadEnvConfig } from "@next/env";

import {
  acquireGraphApplication,
  describeGrantedPermissions,
  graph,
} from "./graph-app-client";

loadEnvConfig(process.cwd());

/**
 * Resolves the SharePoint identifiers the OneDrive adapter needs.
 *
 * An Azure app registration supplies only the tenant, client and secret. The
 * drive and folder the app is allowed to write to are a separate decision, and
 * their identifiers are opaque strings that are tedious to find by hand. This
 * reads them through Graph using the credentials already in the environment.
 *
 * It never writes anything and never prints a secret.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required. Fill the OneDrive block in .env.local first.`,
    );
  }
  return value;
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  pnpm storage:discover -- --site <hostname>:/sites/<path>",
      "  pnpm storage:discover -- --search <text>",
      "",
      "Examples:",
      "  pnpm storage:discover -- --search soundvault",
      "  pnpm storage:discover -- --site contoso.sharepoint.com:/sites/SoundVault",
      "  pnpm storage:discover -- --site contoso.sharepoint.com:/sites/SoundVault --folder SoundVault",
      "",
      "--folder resolves a folder inside the document library and prints its item id.",
      "Without it, the drive root is reported instead.",
      "",
      "--search needs Sites.Read.All. Under the tighter Sites.Selected grant only",
      "--site works, because the app can see just the site it was given.",
    ].join("\n"),
  );
  process.exit(2);
}

function argument(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const tenantId = required("ONEDRIVE_TENANT_ID");
  const clientId = required("ONEDRIVE_CLIENT_ID");
  const clientSecret = required("ONEDRIVE_CLIENT_SECRET");

  const site = argument("--site");
  const search = argument("--search");
  const folder = argument("--folder");
  if (!site && !search) usage();

  const app = await acquireGraphApplication({
    tenantId,
    clientId,
    clientSecret,
  });
  console.log(`Authenticated to Microsoft Graph as "${app.displayName}".`);
  console.log(`${describeGrantedPermissions(app)}\n`);

  if (search) {
    const results = await graph<{
      value: { id: string; displayName: string; webUrl: string }[];
    }>(app, `/sites?search=${encodeURIComponent(search)}`);
    if (results.value.length === 0) {
      console.log(`No site matched "${search}".`);
      return;
    }
    console.log("Matching sites:");
    for (const entry of results.value) {
      console.log(`  ${entry.displayName}`);
      console.log(`    webUrl: ${entry.webUrl}`);
      console.log(`    ONEDRIVE_SITE_ID=${entry.id}`);
    }
    console.log(
      "\nRe-run with --site <hostname>:/sites/<path> to list its document libraries.",
    );
    return;
  }

  const resolved = await graph<{
    id: string;
    displayName: string;
    webUrl: string;
  }>(app, `/sites/${site}`);
  console.log(`Site: ${resolved.displayName}`);
  console.log(`  webUrl: ${resolved.webUrl}`);
  console.log(`  ONEDRIVE_SITE_ID=${resolved.id}\n`);

  const drives = await graph<{
    value: { id: string; name: string; driveType: string; webUrl: string }[];
  }>(app, `/sites/${resolved.id}/drives`);

  console.log("Document libraries on this site:");
  for (const drive of drives.value) {
    console.log(`  ${drive.name}  (${drive.driveType})`);
    console.log(`    webUrl: ${drive.webUrl}`);
    console.log(`    ONEDRIVE_DRIVE_ID=${drive.id}`);

    const rootPath = folder
      ? `/drives/${drive.id}/root:/${encodeURIComponent(folder)}`
      : `/drives/${drive.id}/root`;
    try {
      const item = await graph<{ id: string; name: string }>(app, rootPath);
      console.log(
        `    ONEDRIVE_ROOT_ITEM_ID=${item.id}   (folder "${item.name}")`,
      );
    } catch (error) {
      console.log(
        `    root item unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (folder) {
        console.log(
          `    Create the folder "${folder}" in this library, then re-run.`,
        );
      }
    }
    console.log("");
  }

  console.log(
    "Copy the three values for the library SoundVault should own into .env.local.",
  );
  console.log(
    "Use a dedicated library or folder: the app is given write access to it.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Storage discovery failed",
  );
  process.exitCode = 1;
});
