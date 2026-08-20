import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SubmissionCollection } from "@/features/submissions/components/submission-collection";
import { requireRouteAccess } from "@/lib/auth/current-user";
import { getCoordinatorReviewList } from "@/lib/domain/submissions/submissions";

export const metadata: Metadata = { title: "Review Queue" };

export default async function ReviewPage() {
  await requireRouteAccess("/review");
  const submissions = await getCoordinatorReviewList();
  return (
    <>
      <PageHeader
        title="Review Queue"
        description="Resolve quality, metadata and rights checks before music can be published."
      />
      <SubmissionCollection submissions={submissions} kind="review" />
    </>
  );
}
