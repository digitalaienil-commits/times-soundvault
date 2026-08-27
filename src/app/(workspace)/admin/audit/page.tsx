import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { getAuditRows } from "@/lib/admin/service";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Admin Audit",
};

export default async function AdminAuditPage() {
  await requireRouteAccess("/admin/audit");
  return <AdminWorkspace section="audit" rows={await getAuditRows()} />;
}
