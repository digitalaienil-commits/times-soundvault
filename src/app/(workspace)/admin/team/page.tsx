import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Team Governance",
};

export default async function AdminTeamPage() {
  await requireRouteAccess("/admin/team");
  return <AdminWorkspace section="team" />;
}
