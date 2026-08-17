import { FileAudio } from "lucide-react";
import type { Metadata } from "next";

import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Submissions" };

export default async function MyUploadsPage() {
  await requireRouteAccess("/my-uploads");
  return (
    <>
      <PageHeader
        title="Submissions"
        description="Follow the music you own through drafting, review and publication."
      />
      <FeaturePlaceholder
        title="Submission records come next"
        description="Section 3 will define drafts, ownership and submission states. No sample submissions or invented statuses are shown here."
        icon={FileAudio}
        section="Section 3"
      />
    </>
  );
}
