import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { getDemandRows } from "@/lib/admin/service";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Demand Sheet Operations",
};

export default async function AdminDemandsPage() {
  await requireRouteAccess("/admin/demands");
  return <AdminWorkspace section="demands" rows={await getDemandRows()} />;
}
