import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { getSubmissionRows } from "@/lib/admin/service";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Submission Operations",
};

export default async function AdminSubmissionsPage() {
  await requireRouteAccess("/admin/submissions");
  return (
    <AdminWorkspace section="submissions" rows={await getSubmissionRows()} />
  );
}
