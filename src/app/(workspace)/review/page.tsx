import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { ReviewQueue } from "@/features/review/components/review-queue";
import { requireRouteAccess } from "@/lib/auth/current-user";
import { getReviewQueue } from "@/lib/review/review";
import { reviewQueueFiltersSchema } from "@/lib/review/validation";

export const metadata: Metadata = { title: "Review Queue" };

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRouteAccess("/review");
  const raw = await searchParams;
  const filters = reviewQueueFiltersSchema.parse(
    Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : value,
      ]),
    ),
  );
  const result = await getReviewQueue(user.id, filters);
  return (
    <>
      <PageHeader
        title="Review Queue"
        description="Review audio, metadata, technical quality, rights and copyright before preparing a locked decision handoff."
      />
      <ReviewQueue result={result} filters={filters} currentUserId={user.id} />
    </>
  );
}
