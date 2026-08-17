import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminPage() {
  await requireRouteAccess("/admin");

  return (
    <>
      <PageHeader
        title="Admin"
        description="Review the protected system area reserved for future workspace operations."
      />
      <FeaturePlaceholder
        title="Administration will remain intentional"
        description="Team access is available from the Team page. Provider management and protected system settings remain intentionally unavailable."
        icon={ShieldCheck}
        section="Section 12"
      />
    </>
  );
}
