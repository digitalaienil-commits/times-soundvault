import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { listAdminMaintenanceJobs } from "@/lib/admin/maintenance";
import { getIntegrityRows } from "@/lib/admin/service";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Integrity Findings",
};

export default async function AdminIntegrityPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireRouteAccess("/admin/integrity");
  const [params, rows, jobs] = await Promise.all([
    searchParams,
    getIntegrityRows(),
    listAdminMaintenanceJobs(),
  ]);
  return (
    <AdminWorkspace
      section="integrity"
      rows={rows}
      jobs={jobs}
      notice={params.notice}
      error={params.error}
    />
  );
}
