import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { listAdminMaintenanceJobs } from "@/lib/admin/maintenance";
import { getMediaRows } from "@/lib/admin/service";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Media Operations",
};

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireRouteAccess("/admin/media");
  const [params, rows, jobs] = await Promise.all([
    searchParams,
    getMediaRows(),
    listAdminMaintenanceJobs(),
  ]);
  return (
    <AdminWorkspace
      section="media"
      rows={rows}
      jobs={jobs}
      notice={params.notice}
      error={params.error}
    />
  );
}
