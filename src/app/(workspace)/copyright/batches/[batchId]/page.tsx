import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageHeader } from "@/components/shared/page-header";
import { CopyrightBatchDetail } from "@/features/copyright/components/copyright-batch-detail";
import { requireRouteFamilyAccess } from "@/lib/auth/current-user";
import { getCopyrightBatch } from "@/lib/copyright/repository";
import { getDatabase } from "@/lib/database/database";

export const metadata: Metadata = { title: "Copyright Test Batch" };

export default async function CopyrightBatchPage({
  params,
}: PageProps<"/copyright/batches/[batchId]">) {
  const { batchId: rawBatchId } = await params;
  const batchId = z.uuid().safeParse(rawBatchId);
  if (!batchId.success) notFound();
  await requireRouteFamilyAccess(
    "/copyright/batches/[batchId]",
    `/copyright/batches/${batchId.data}`,
  );
  const batch = await getCopyrightBatch(getDatabase(), batchId.data);
  if (!batch) notFound();
  return (
    <>
      <PageHeader
        title="Copyright Test Batch"
        description="Private manual-check package and human-recorded observations."
      />
      <CopyrightBatchDetail batch={batch} />
    </>
  );
}
