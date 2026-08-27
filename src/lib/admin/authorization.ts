import "server-only";

import { requirePermission } from "@/lib/auth/current-user";

export async function requireAdminOperation(callbackUrl = "/admin") {
  return requirePermission("admin.manage", callbackUrl);
}
