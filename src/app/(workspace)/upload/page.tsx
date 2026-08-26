import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageHeader } from "@/components/shared/page-header";
import { ResumableBatches } from "@/features/uploads/components/resumable-batches";
import { UploadWorkspace } from "@/features/uploads/components/upload-workspace";
import { requireRouteAccess } from "@/lib/auth/current-user";
import {
  getResumableUploadBatches,
  getRevisionUploadContext,
} from "@/lib/domain/uploads/uploads";
import { parseStorageConfig, toPublicUploadConfig } from "@/lib/storage/config";
import { getUploadDemandContext } from "@/lib/demands/repository";
import { getDatabase } from "@/lib/database/database";

export const metadata: Metadata = {
  title: "Upload",
};

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ submissionId?: string; demandId?: string }>;
}) {
  const user = await requireRouteAccess("/upload");
  const { submissionId: rawSubmissionId, demandId: rawDemandId } =
    await searchParams;
  const submissionId = rawSubmissionId
    ? z.uuid().safeParse(rawSubmissionId)
    : null;
  if (submissionId && !submissionId.success) notFound();
  const demandId = rawDemandId ? z.uuid().safeParse(rawDemandId) : null;
  if (demandId && !demandId.success) notFound();
  if (submissionId?.success && demandId?.success) notFound();
  const [batches, config, revisionContext, demandContext] = await Promise.all([
    getResumableUploadBatches(user),
    Promise.resolve(toPublicUploadConfig(parseStorageConfig())),
    submissionId?.success
      ? getRevisionUploadContext(submissionId.data, user)
      : Promise.resolve(undefined),
    demandId?.success
      ? getUploadDemandContext(getDatabase(), demandId.data, user)
      : Promise.resolve(undefined),
  ]);
  if (submissionId?.success && !revisionContext) notFound();
  if (demandId?.success && !demandContext) notFound();

  return (
    <>
      <PageHeader
        title={
          revisionContext
            ? "Revise submission"
            : demandContext
              ? "Create new Track for Demand"
              : "Upload music"
        }
        description={
          revisionContext
            ? "Upload a new immutable Revision with one Master and optional replacement Stems."
            : "Create a single-track or bulk package with one Master and optional Stems. Metadata can be added now or completed later."
        }
      />
      <ResumableBatches batches={batches} />
      <UploadWorkspace
        config={config}
        revisionContext={revisionContext ?? undefined}
        demandContext={demandContext ?? undefined}
      />
    </>
  );
}
