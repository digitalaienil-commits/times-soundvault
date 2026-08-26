import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { updateDemandAction } from "@/features/demands/actions/demand-actions";
import { DemandForm } from "@/features/demands/components/demand-form";
import { requireRouteFamilyAccess } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/database/database";
import {
  getDemandDetail,
  listDemandFormOptions,
} from "@/lib/demands/repository";

export const metadata: Metadata = { title: "Edit Demand" };
export default async function EditDemandPage({
  params,
}: {
  params: Promise<{ demandId: string }>;
}) {
  const { demandId } = await params;
  const user = await requireRouteFamilyAccess(
    "/demands/[demandId]/edit",
    `/demands/${demandId}/edit`,
  );
  const [demand, options] = await Promise.all([
    getDemandDetail(getDatabase(), demandId, user),
    listDemandFormOptions(getDatabase()),
  ]);
  if (!demand) notFound();
  return (
    <>
      <PageHeader
        title="Edit Demand"
        description={`${demand.displayNumber} · Material creative changes create Brief v${demand.briefVersion + 1}.`}
      />
      <DemandForm
        action={updateDemandAction}
        options={options}
        demand={demand}
      />
    </>
  );
}
