import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { FoundationDashboard } from "@/features/foundation/components/foundation-dashboard";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await requireRouteAccess("/dashboard");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Move music submissions through one clear, accountable internal workflow."
      />
      <FoundationDashboard role={user.role} userId={user.id} />
    </>
  );
}
