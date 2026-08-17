import type { Metadata } from "next";
import { z } from "zod";

import { PageHeader } from "@/components/shared/page-header";
import { TeamAccessPage } from "@/features/team-access/components/team-access-page";
import { requireRouteAccess } from "@/lib/auth/current-user";
import { getTeamMemberHistory, getTeamMembers } from "@/lib/auth/team-access";

export const metadata: Metadata = { title: "Team" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  await requireRouteAccess("/team");
  const query = await searchParams;
  const historyId = first(query.history);
  const selectedHistoryId = z.string().uuid().safeParse(historyId).success
    ? historyId
    : undefined;
  const filters = {
    search: first(query.search),
    role: first(query.role),
    status: first(query.status),
  };
  const [members, history] = await Promise.all([
    getTeamMembers(filters),
    selectedHistoryId ? getTeamMemberHistory(selectedHistoryId) : [],
  ]);
  return (
    <>
      <PageHeader
        title="Team"
        description="Assign one server-owned role, bind approved company identities and revoke access without deleting history."
      />
      <TeamAccessPage
        members={members}
        history={history}
        selectedHistoryId={selectedHistoryId}
        notice={first(query.notice)}
        error={first(query.error)}
        filters={filters}
      />
    </>
  );
}
