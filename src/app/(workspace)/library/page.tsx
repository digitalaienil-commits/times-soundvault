import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { LibraryCollection } from "@/features/catalog/components/library-collection";
import { requireRouteAccess } from "@/lib/auth/current-user";
import { getPublishedCatalog } from "@/lib/domain/catalog/catalog";

export const metadata: Metadata = {
  title: "Library",
};

export default async function LibraryPage() {
  await requireRouteAccess("/library");
  const tracks = await getPublishedCatalog();
  return (
    <>
      <PageHeader
        title="Library"
        description="Discover, listen to and download music after it has completed the approved workflow."
      />
      <LibraryCollection tracks={tracks} />
    </>
  );
}
