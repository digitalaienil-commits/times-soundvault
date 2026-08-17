import type { ReactNode } from "react";
import { headers } from "next/headers";

import { AppShell } from "@/components/shell/app-shell";
import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";
import { requireCurrentUser } from "@/lib/auth/current-user";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const callbackUrl = sanitizeCallbackUrl(
    requestHeaders.get("x-soundvault-callback"),
    "/dashboard",
  );
  const user = await requireCurrentUser(callbackUrl);

  return <AppShell user={user}>{children}</AppShell>;
}
