import { UploadCloud } from "lucide-react";
import type { Metadata } from "next";

import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Upload",
};

export default async function UploadPage() {
  await requireRouteAccess("/upload");

  return (
    <>
      <PageHeader
        title="Upload"
        description="Prepare tracks and stems for the future submission workflow."
      />
      <FeaturePlaceholder
        title="The upload workflow comes later"
        description="Secure file handling starts after the audio, catalog and submission records are defined. This screen does not upload anything yet."
        icon={UploadCloud}
        section="Section 4"
      />
    </>
  );
}
