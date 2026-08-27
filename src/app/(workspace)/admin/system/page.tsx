import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/components/admin-workspace";
import { getSystemHealthItems } from "@/lib/admin/diagnostics";
import { requireRouteAccess } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "System Health",
};

export default async function AdminSystemPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireRouteAccess("/admin/system");
  const [params, health] = await Promise.all([
    searchParams,
    getSystemHealthItems(),
  ]);
  return (
    <AdminWorkspace
      section="system"
      health={health}
      notice={params.notice}
      error={params.error}
    />
  );
}
