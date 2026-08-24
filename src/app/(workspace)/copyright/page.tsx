import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { CopyrightWorkspace } from "@/features/copyright/components/copyright-workspace";
import { requireRouteAccess } from "@/lib/auth/current-user";
import { createCopyrightProvider } from "@/lib/copyright/provider";
import {
  listCopyrightBatches,
  listCopyrightChecks,
} from "@/lib/copyright/repository";
import { getDatabase } from "@/lib/database/database";

export const metadata: Metadata = { title: "Copyright Checks" };

export default async function CopyrightPage() {
  const user = await requireRouteAccess("/copyright");
  const [checks, batches] = await Promise.all([
    listCopyrightChecks(getDatabase(), user),
    listCopyrightBatches(getDatabase()),
  ]);
  const capabilities = createCopyrightProvider().getCapabilities();
  return (
    <>
      <PageHeader
        title="Copyright Checks"
        description="Prepare YouTube checks, record observed claims and assess Content ID readiness."
      />
      <CopyrightWorkspace
        checks={checks}
        batches={batches}
        canAdminister={user.role === "admin"}
        providerReason={capabilities.reason}
      />
    </>
  );
}
