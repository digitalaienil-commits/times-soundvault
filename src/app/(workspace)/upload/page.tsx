import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { ResumableBatches } from "@/features/uploads/components/resumable-batches";
import { UploadWorkspace } from "@/features/uploads/components/upload-workspace";
import { requireRouteAccess } from "@/lib/auth/current-user";
import { getResumableUploadBatches } from "@/lib/domain/uploads/uploads";
import { parseStorageConfig, toPublicUploadConfig } from "@/lib/storage/config";

export const metadata: Metadata = {
  title: "Upload",
};

export default async function UploadPage() {
  const user = await requireRouteAccess("/upload");
  const [batches, config] = await Promise.all([
    getResumableUploadBatches(user),
    Promise.resolve(toPublicUploadConfig(parseStorageConfig())),
  ]);

  return (
    <>
      <PageHeader
        title="Upload music"
        description="Create a single-track or bulk package with one Master and optional Stems. Metadata can be added now or completed later."
      />
      <ResumableBatches batches={batches} />
      <UploadWorkspace config={config} />
    </>
  );
}
