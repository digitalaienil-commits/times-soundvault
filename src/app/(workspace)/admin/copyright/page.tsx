import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { getCopyrightRows } from "@/lib/admin/service";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Copyright Operations",
};

export default async function AdminCopyrightPage() {
  await requireRouteAccess("/admin/copyright");
  return <AdminWorkspace section="copyright" rows={await getCopyrightRows()} />;
}
