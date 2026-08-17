import { redirect } from "next/navigation";

import { getAuthState } from "@/lib/auth/current-user";
import { getDefaultRouteForRole } from "@/lib/auth/route-policy";

export default async function HomePage() {
  const state = await getAuthState();
  if (state.kind === "unauthenticated") {
    redirect("/sign-in");
  }
  if (state.kind === "access_not_assigned") {
    redirect("/access-not-assigned");
  }
  redirect(getDefaultRouteForRole(state.user.role));
}
