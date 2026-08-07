import "server-only";

import { cache } from "react";
import { connection } from "next/server";

import { getMockUser } from "@/mocks/current-user";
import type { CurrentUser } from "@/types/auth";

import { resolveDemoRole } from "./demo-role";

export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  await connection();
  const role = resolveDemoRole(process.env.DEMO_ROLE, process.env.NODE_ENV);
  return getMockUser(role);
});
