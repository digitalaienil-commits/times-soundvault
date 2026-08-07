import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canAccessRoute } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!canAccessRoute(user.role, "/admin")) {
    redirect("/dashboard");
  }

  return (
    <>
      <PageHeader
        title="Admin"
        description="Manage internal access, provider configuration and workspace controls."
      />
      <FeaturePlaceholder
        title="Administration will remain intentional"
        description="Access management and provider controls will be added only after real authentication and service boundaries exist."
        icon={ShieldCheck}
        section="Section 9"
      />
    </>
  );
}
