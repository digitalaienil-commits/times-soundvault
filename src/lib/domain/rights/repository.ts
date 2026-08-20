import "server-only";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { RightsDeclarationDto } from "@/types/domain/rights";

import { mapRightsDeclarationRow } from "./mapper";
import type { RightsDeclarationRow } from "./mapper";

type Queryable = Pick<Pool | PoolClient, "query">;
type RightsQueryRow = RightsDeclarationRow & QueryResultRow;

export async function getRightsDeclaration(
  database: Queryable,
  submissionRevisionId: string,
): Promise<RightsDeclarationDto | null> {
  const result = await database.query<RightsQueryRow>(
    `SELECT *
     FROM rights.rights_declaration
     WHERE submission_revision_id = $1
     LIMIT 1`,
    [submissionRevisionId],
  );
  return result.rows[0] ? mapRightsDeclarationRow(result.rows[0]) : null;
}
