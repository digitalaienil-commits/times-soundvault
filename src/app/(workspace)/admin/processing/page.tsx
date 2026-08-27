import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { listAdminMaintenanceJobs } from "@/lib/admin/maintenance";
import { getProcessingRows } from "@/lib/admin/service";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Processing Operations",
};

export default async function AdminProcessingPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireRouteAccess("/admin/processing");
  const [params, rows, jobs] = await Promise.all([
    searchParams,
    getProcessingRows(),
    listAdminMaintenanceJobs(),
  ]);
  return (
    <AdminWorkspace
      section="processing"
      rows={rows}
      jobs={jobs}
      notice={params.notice}
      error={params.error}
    />
  );
}
