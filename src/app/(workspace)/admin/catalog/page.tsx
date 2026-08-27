import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { getCatalogMaintenanceRows } from "@/lib/admin/service";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Catalog Governance",
};

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireRouteAccess("/admin/catalog");
  const [params, rows] = await Promise.all([
    searchParams,
    getCatalogMaintenanceRows(),
  ]);
  return (
    <AdminWorkspace
      section="catalog"
      rows={rows}
      notice={params.notice}
      error={params.error}
    />
  );
}
