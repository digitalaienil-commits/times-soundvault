import { UploadCloud } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canAccessRoute } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Upload",
};

export default async function UploadPage() {
  const user = await getCurrentUser();

  if (!canAccessRoute(user.role, "/upload")) {
    redirect("/dashboard");
  }

  return (
    <>
      <PageHeader
        title="Upload"
        description="Add audio files for automatic analysis and library indexing."
      />
      <FeaturePlaceholder
        title="The upload workflow comes later"
        description="Secure file handling, analysis states and indexing will be designed together with the audio data model."
        icon={UploadCloud}
        section="Section 7"
      />
    </>
  );
}
