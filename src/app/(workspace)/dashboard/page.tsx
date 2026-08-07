import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { FoundationDashboard } from "@/features/foundation/components/foundation-dashboard";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Find, understand and create the right audio from one internal workspace."
      />
      <FoundationDashboard role={user.role} />
    </>
  );
}
