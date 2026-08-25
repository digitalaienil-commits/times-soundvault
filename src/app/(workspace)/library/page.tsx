import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { CatalogFilters } from "@/features/catalog/components/catalog-filters";
import { CatalogResults } from "@/features/catalog/components/catalog-results";
import { SearchControls } from "@/features/catalog/components/search-controls";
import { requireRouteAccess } from "@/lib/auth/current-user";
import { searchPublishedCatalog } from "@/lib/catalog-search/service";
import { CatalogSearchValidationError } from "@/lib/catalog-search/validation";

export const metadata: Metadata = { title: "Published Library" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRouteAccess("/library");
  const params = await searchParams;
  let result;
  try {
    result = await searchPublishedCatalog(params);
  } catch (error) {
    if (error instanceof CatalogSearchValidationError) {
      return (
        <>
          <PageHeader
            title="Published Library"
            description="Search approved, canonical music available to the SoundVault team."
          />
          <section
            role="alert"
            className="mt-7 rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive"
          >
            <h2 className="font-semibold">Search could not be applied</h2>
            <p className="mt-1">{error.message}</p>
            <Link
              className="mt-3 inline-block font-semibold underline underline-offset-4"
              href="/library"
            >
              Reset library search
            </Link>
          </section>
        </>
      );
    }
    throw error;
  }
  return (
    <>
      <PageHeader
        title="Published Library"
        description="Find approved canonical tracks by title, identifier, mood, format, use case and music metadata."
      />
      <SearchControls input={result.input} />
      <div className="mt-4 lg:hidden">
        <CatalogFilters input={result.input} facets={result.facets} />
      </div>
      <div className="mt-7 flex items-start gap-7">
        <div className="hidden lg:block">
          <CatalogFilters input={result.input} facets={result.facets} />
        </div>
        <main className="min-w-0 flex-1" aria-label="Published library results">
          <CatalogResults result={result} />
        </main>
      </div>
    </>
  );
}
