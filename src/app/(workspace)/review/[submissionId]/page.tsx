import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReviewWorkspace } from "@/features/review/components/review-workspace";
import { DecisionPanel } from "@/features/decisions/components/decision-panel";
import { requireRouteFamilyAccess } from "@/lib/auth/current-user";
import {
  createReviewDecisionPacket,
  getReviewAggregate,
} from "@/lib/review/review";

export const metadata: Metadata = { title: "Coordinator Review" };

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const callbackUrl = `/review/${submissionId}`;
  const user = await requireRouteFamilyAccess(
    "/review/[submissionId]",
    callbackUrl,
  );
  const aggregate = await getReviewAggregate(submissionId, user);
  if (!aggregate) notFound();
  const packet =
    aggregate.reviewCase?.status === "ready_for_decision"
      ? await createReviewDecisionPacket(aggregate.reviewCase.id)
      : null;
  return (
    <>
      <ReviewWorkspace aggregate={aggregate} user={user} />
      {packet ? <DecisionPanel packet={packet} user={user} /> : null}
    </>
  );
}
