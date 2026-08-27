import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { listAdminMaintenanceJobs } from "@/lib/admin/maintenance";
import { getRetentionPreview } from "@/lib/admin/retention";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Retention and Cleanup",
};

export default async function AdminRetentionPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireRouteAccess("/admin/retention");
  const [params, retention, jobs] = await Promise.all([
    searchParams,
    getRetentionPreview(),
    listAdminMaintenanceJobs(),
  ]);
  return (
    <AdminWorkspace
      section="retention"
      retention={retention}
      jobs={jobs}
      notice={params.notice}
      error={params.error}
    />
  );
}
