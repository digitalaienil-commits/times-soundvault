import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";

import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Review Queue" };

export default async function ReviewPage() {
  await requireRouteAccess("/review");
  return (
    <>
      <PageHeader
        title="Review Queue"
        description="Resolve quality, metadata and rights checks before music can be published."
      />
      <FeaturePlaceholder
        title="Review decisions are not simulated"
        description="The Coordinator review workspace will be built only after real submission, analysis and copyright records exist."
        icon={ClipboardCheck}
        section="Section 7"
      />
    </>
  );
}
