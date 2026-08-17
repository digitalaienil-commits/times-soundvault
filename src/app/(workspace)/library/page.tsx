import { LibraryBig } from "lucide-react";
import type { Metadata } from "next";

import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Library",
};

export default async function LibraryPage() {
  await requireRouteAccess("/library");
  return (
    <>
      <PageHeader
        title="Library"
        description="Discover, listen to and download music after it has completed the approved workflow."
      />
      <FeaturePlaceholder
        title="The published library begins in Section 3"
        description="Catalog records, discovery, playback and downloads will be introduced with the audio and submission domain. No unpublished material is shown here."
        icon={LibraryBig}
        section="Section 3"
      />
    </>
  );
}
