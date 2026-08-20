import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SubmissionCollection } from "@/features/submissions/components/submission-collection";
import { requireRouteAccess } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getAllSubmissionList,
  getProducerSubmissionList,
} from "@/lib/domain/submissions/submissions";

export const metadata: Metadata = { title: "Submissions" };

export default async function MyUploadsPage() {
  const user = await requireRouteAccess("/my-uploads");
  const submissions = hasPermission(user.role, "submission.readAll")
    ? await getAllSubmissionList()
    : await getProducerSubmissionList(user.id);
  return (
    <>
      <PageHeader
        title="Submissions"
        description="Follow the music you own through drafting, review and publication."
      />
      <SubmissionCollection submissions={submissions} kind="owned" />
    </>
  );
}
