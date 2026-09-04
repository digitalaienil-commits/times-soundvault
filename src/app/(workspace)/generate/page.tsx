import "server-only";

import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { GenerationWorkspace } from "@/features/generation/components/generation-workspace";
import { requireRouteAccess } from "@/lib/auth/current-user";
import { parseGenerationConfig } from "@/lib/generation/config";

export const metadata: Metadata = {
  title: "AI Music Generation",
  description:
    "Internal AI music generation workspace with Google Lyria 3 and ElevenLabs",
};

export default async function GeneratePage() {
  await requireRouteAccess("/generate");
  const config = parseGenerationConfig();

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Music Generation"
        description="Generate internal audio drafts with Google Lyria 3 or ElevenLabs. All outputs remain unpublished drafts with complete AI provenance."
      />
      <GenerationWorkspace
        initialDryRun={config.dryRun}
        defaultProvider={config.provider}
      />
    </div>
  );
}
