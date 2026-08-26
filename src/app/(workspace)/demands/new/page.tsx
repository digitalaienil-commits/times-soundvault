import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { createDemandAction } from "@/features/demands/actions/demand-actions";
import { DemandForm } from "@/features/demands/components/demand-form";
import { requireRouteFamilyAccess } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/database/database";
import { listDemandFormOptions } from "@/lib/demands/repository";

export const metadata: Metadata = { title: "New Demand" };
export default async function NewDemandPage() {
  await requireRouteFamilyAccess("/demands/new", "/demands/new");
  const options = await listDemandFormOptions(getDatabase());
  return (
    <>
      <PageHeader
        title="New Demand"
        description="Define the business need, timing and structured creative requirements."
      />
      <DemandForm action={createDemandAction} options={options} />
    </>
  );
}
