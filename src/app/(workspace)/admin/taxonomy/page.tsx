import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { listAdminTaxonomyTerms } from "@/lib/admin/taxonomy";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Taxonomy Administration",
};

export default async function AdminTaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    search?: string;
    category?: string;
  }>;
}) {
  await requireRouteAccess("/admin/taxonomy");
  const params = await searchParams;
  const taxonomyTerms = await listAdminTaxonomyTerms({
    search: params.search,
    category: params.category,
  });
  return (
    <AdminWorkspace
      section="taxonomy"
      taxonomyTerms={taxonomyTerms}
      taxonomyFilters={{ search: params.search, category: params.category }}
      notice={params.notice}
      error={params.error}
    />
  );
}
