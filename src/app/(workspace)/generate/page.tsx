import { Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Generate",
};

export default function GeneratePage() {
  return (
    <>
      <PageHeader
        title="Generate"
        description="Create music and sound effects from a structured creative brief."
      />
      <FeaturePlaceholder
        title="Creative generation is planned"
        description="A focused generation studio will arrive after the audio experience and provider boundaries are established."
        icon={Sparkles}
        section="Section 8"
      />
    </>
  );
}
