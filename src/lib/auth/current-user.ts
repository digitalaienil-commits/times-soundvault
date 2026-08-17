import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDatabase } from "@/lib/database/database";
import type { CurrentUser } from "@/types/auth";
import type { WorkspaceRoute } from "@/types/navigation";

import { auth } from "./auth";
import { sanitizeCallbackUrl } from "./callback-url";
import { toCurrentUser } from "./current-user-dto";
import type { Permission } from "./permissions";
import { hasPermission } from "./permissions";
import { canAccessRoute } from "./route-policy";
import { findTeamAccessByUserId } from "./team-access-repository";

export type AuthState =
  | { kind: "unauthenticated" }
  | { kind: "access_not_assigned" }
  | { kind: "authenticated"; user: CurrentUser };

export const getAuthSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getAuthState = cache(async (): Promise<AuthState> => {
  const session = await getAuthSession();
  if (!session) {
    return { kind: "unauthenticated" };
  }
  const access = await findTeamAccessByUserId(getDatabase(), session.user.id);
  if (!access) {
    return { kind: "access_not_assigned" };
  }
  const user = toCurrentUser(session.user, access);
  return user
    ? { kind: "authenticated", user }
    : { kind: "access_not_assigned" };
});

export async function getOptionalCurrentUser(): Promise<CurrentUser | null> {
  const state = await getAuthState();
  return state.kind === "authenticated" ? state.user : null;
}

export async function requireCurrentUser(
  callbackUrl = "/dashboard",
): Promise<CurrentUser> {
  const state = await getAuthState();
  if (state.kind === "unauthenticated") {
    const callback = sanitizeCallbackUrl(callbackUrl, "/dashboard");
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callback)}`);
  }
  if (state.kind === "access_not_assigned") {
    redirect("/access-not-assigned");
  }
  return state.user;
}

export async function requirePermission(
  permission: Permission,
  callbackUrl = "/dashboard",
): Promise<CurrentUser> {
  const user = await requireCurrentUser(callbackUrl);
  if (!hasPermission(user.role, permission)) {
    redirect("/access-denied");
  }
  return user;
}

export async function requireRouteAccess(
  route: WorkspaceRoute,
): Promise<CurrentUser> {
  const user = await requireCurrentUser(route);
  if (!canAccessRoute(user.role, route)) {
    redirect("/access-denied");
  }
  return user;
}
