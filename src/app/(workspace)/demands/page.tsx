import { ListMusic } from "lucide-react";
import type { Metadata } from "next";

import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Demand Sheet" };

export default async function DemandsPage() {
  await requireRouteAccess("/demands");
  return (
    <>
      <PageHeader
        title="Demand Sheet"
        description="Coordinate future music needs for festivals, events and themes."
      />
      <FeaturePlaceholder
        title="Demand management remains intentionally empty"
        description="The Demand Sheet workflow belongs to Section 11. This route confirms access boundaries without inventing requests or activity."
        icon={ListMusic}
        section="Section 11"
      />
    </>
  );
}
