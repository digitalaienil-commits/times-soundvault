import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageHeader } from "@/components/shared/page-header";
import { UploadSubmissionDetail } from "@/features/uploads/components/submission-detail";
import { requireRouteFamilyAccess } from "@/lib/auth/current-user";
import { getRevisionRightsDeclaration } from "@/lib/domain/rights/rights";
import { canMutateUploadSubmission } from "@/lib/domain/uploads/authorization";
import {
  getUploadSubmissionEvents,
  getUploadWorkspaceSubmission,
} from "@/lib/domain/uploads/uploads";

export const metadata: Metadata = { title: "Submission Details" };

export default async function SubmissionDetailPage({
  params,
}: PageProps<"/submissions/[submissionId]">) {
  const { submissionId: rawSubmissionId } = await params;
  const submissionId = z.uuid().safeParse(rawSubmissionId);
  if (!submissionId.success) notFound();
  const user = await requireRouteFamilyAccess(
    "/submissions/[submissionId]",
    `/submissions/${submissionId.data}`,
  );
  const submission = await getUploadWorkspaceSubmission(
    submissionId.data,
    user,
  );
  if (!submission) notFound();
  const [rights, events] = await Promise.all([
    getRevisionRightsDeclaration(submission.revisionId),
    getUploadSubmissionEvents(submission.id),
  ]);
  return (
    <>
      <PageHeader
        title={submission.title}
        description={`Submission ${submission.status.replaceAll("_", " ")} · owned by ${submission.ownerName}`}
      />
      <UploadSubmissionDetail
        submission={submission}
        rights={rights}
        events={events}
        canMutate={canMutateUploadSubmission(user, submission.ownerUserId)}
      />
    </>
  );
}
