import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageHeader } from "@/components/shared/page-header";
import { ResumeTransferPanel } from "@/features/uploads/components/resume-transfer-panel";
import { UploadSubmissionCollection } from "@/features/uploads/components/upload-submission-collection";
import { requireRouteFamilyAccess } from "@/lib/auth/current-user";
import { getUploadBatchSubmissions } from "@/lib/domain/uploads/uploads";

export const metadata: Metadata = { title: "Resume Upload" };

export default async function UploadBatchPage({
  params,
}: PageProps<"/upload/[batchId]">) {
  const { batchId: rawBatchId } = await params;
  const batchId = z.uuid().safeParse(rawBatchId);
  if (!batchId.success) notFound();
  const user = await requireRouteFamilyAccess(
    "/upload/[batchId]",
    `/upload/${batchId.data}`,
  );
  const submissions = await getUploadBatchSubmissions(batchId.data, user);
  if (submissions.length === 0) notFound();
  return (
    <>
      <PageHeader
        title="Resume upload"
        description="Reselect unfinished local files to continue from the last server-confirmed byte. Completed sibling Tracks remain intact."
      />
      <div className="mt-8 space-y-6">
        <ResumeTransferPanel submissions={submissions} />
        <UploadSubmissionCollection
          submissions={submissions}
          showOwner={user.role === "admin"}
        />
      </div>
    </>
  );
}
