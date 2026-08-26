import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { CatalogFilters } from "@/features/catalog/components/catalog-filters";
import { SearchControls } from "@/features/catalog/components/search-controls";
import { DemandCatalogResults } from "@/features/demands/components/demand-catalog-results";
import { hasPermission } from "@/lib/auth/permissions";
import { requireRouteFamilyAccess } from "@/lib/auth/current-user";
import { searchPublishedCatalog } from "@/lib/catalog-search/service";
import { TAXONOMY_FILTERS } from "@/lib/catalog-search/filters";
import { getDatabase } from "@/lib/database/database";
import { getDemandSearchProjection } from "@/lib/demands/repository";

export const metadata: Metadata = { title: "Find existing music" };

export default async function DemandFindPage({
  params,
  searchParams,
}: {
  params: Promise<{ demandId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { demandId } = await params;
  const user = await requireRouteFamilyAccess(
    "/demands/[demandId]/find",
    `/demands/${demandId}/find`,
  );
  const projection = await getDemandSearchProjection(
    getDatabase(),
    demandId,
    user,
  );
  if (!projection) notFound();
  const received = await searchParams;
  const raw: Record<string, string | string[] | undefined> = { ...received };
  if (Object.keys(received).length === 0) {
    raw.type = projection.assetKind;
    if (projection.bpmMin != null) raw.bpmMin = String(projection.bpmMin);
    if (projection.bpmMax != null) raw.bpmMax = String(projection.bpmMax);
    if (projection.durationMinMs != null)
      raw.durationMin = String(projection.durationMinMs / 1000);
    if (projection.durationMaxMs != null)
      raw.durationMax = String(projection.durationMaxMs / 1000);
    if (projection.vocalState) raw.vocal = projection.vocalState;
    if (projection.underDialogue != null)
      raw.underDialogue = projection.underDialogue ? "yes" : "no";
    if (projection.loopable != null)
      raw.loopable = projection.loopable ? "yes" : "no";
    if (projection.stemsRequired) raw.hasStems = "yes";
    if (projection.endingType) raw.ending = projection.endingType;
    for (const filter of TAXONOMY_FILTERS) {
      const values = projection.requiredTerms
        .filter((term) => term.category === filter.category)
        .map((term) => term.slug);
      if (values.length) raw[filter.parameter] = values;
    }
  }
  const result = await searchPublishedCatalog(raw);
  const action = `/demands/${demandId}/find`;
  return (
    <>
      <Link
        href={`/demands/${demandId}`}
        className="text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        ← Back to {projection.displayNumber}
      </Link>
      <PageHeader
        title="Find existing music"
        description={`${projection.title} · Required filters are applied to the existing Section 9 published catalog.`}
      />
      <section className="mt-5 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Demand direction</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Required filters
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {projection.requiredTerms.map((term) => (
                <Badge key={term.id} variant="outline">
                  {term.label}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Preferred — not hard filters
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {projection.preferredTerms.map((term) => (
                <Badge key={term.id} variant="secondary">
                  {term.label}
                </Badge>
              ))}
              {!projection.preferredTerms.length ? (
                <span className="text-sm text-muted-foreground">
                  None specified
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          You may relax filters to explore. Search changes never mutate the
          Demand.
        </p>
      </section>
      <SearchControls input={result.input} action={action} />
      <div className="mt-4 lg:hidden">
        <CatalogFilters
          input={result.input}
          facets={result.facets}
          action={action}
        />
      </div>
      <div className="mt-7 flex items-start gap-7">
        <div className="hidden lg:block">
          <CatalogFilters
            input={result.input}
            facets={result.facets}
            action={action}
          />
        </div>
        <main className="min-w-0 flex-1">
          <DemandCatalogResults
            demandId={demandId}
            result={result}
            canRespond={hasPermission(user.role, "demand.respond")}
            canManage={hasPermission(user.role, "demand.manage")}
            rowVersion={projection.rowVersion}
          />
        </main>
      </div>
    </>
  );
}
