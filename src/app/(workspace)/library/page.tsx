import { LibraryBig } from "lucide-react";
import type { Metadata } from "next";

import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Library",
};

export default function LibraryPage() {
  return (
    <>
      <PageHeader
        title="Library"
        description="Search, preview and download uploaded and generated audio."
      />
      <FeaturePlaceholder
        title="The intelligent library is taking shape"
        description="Discovery, filtering and audio previews will be introduced when the audio domain foundation is ready."
        icon={LibraryBig}
        section="Section 5"
      />
    </>
  );
}
