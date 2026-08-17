import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { requireCurrentUser } from "@/lib/auth/current-user";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireCurrentUser();

  return <AppShell user={user}>{children}</AppShell>;
}
