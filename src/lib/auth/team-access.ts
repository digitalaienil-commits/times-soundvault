import "server-only";

import { getDatabase } from "@/lib/database/database";

import {
  addTeamAccess,
  changeTeamRole,
  listAccessHistory,
  listTeamAccess,
  setTeamAccessSuspended,
} from "./team-access-repository";

export async function getTeamMembers(
  filters: { search?: string; role?: string; status?: string } = {},
) {
  return listTeamAccess(getDatabase(), filters);
}

export async function getTeamMemberHistory(accessId: string) {
  return listAccessHistory(getDatabase(), accessId);
}

export async function createTeamMember(
  input: Parameters<typeof addTeamAccess>[1],
) {
  return addTeamAccess(getDatabase(), input);
}

export async function updateTeamMemberRole(
  input: Parameters<typeof changeTeamRole>[1],
) {
  return changeTeamRole(getDatabase(), input);
}

export async function updateTeamMemberSuspension(
  input: Parameters<typeof setTeamAccessSuspended>[1],
) {
  return setTeamAccessSuspended(getDatabase(), input);
}
