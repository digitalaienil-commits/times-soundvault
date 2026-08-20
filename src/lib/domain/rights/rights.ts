import "server-only";

import { getDatabase } from "@/lib/database/database";

import { getRightsDeclaration } from "./repository";

export async function getRevisionRightsDeclaration(revisionId: string) {
  return getRightsDeclaration(getDatabase(), revisionId);
}
