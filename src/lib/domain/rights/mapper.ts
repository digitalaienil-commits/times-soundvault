import { CONTENT_ID_ELIGIBILITIES, RIGHTS_BASES } from "@/types/domain/rights";
import type { RightsDeclarationDto } from "@/types/domain/rights";

import {
  DomainRecordError,
  toIsoString,
  toNullableIsoString,
} from "../record-mapping";

function includes<const Values extends readonly string[]>(
  values: Values,
  value: string,
): value is Values[number] {
  return values.includes(value);
}

export interface RightsDeclarationRow {
  id: string;
  submission_revision_id: string;
  master_rights_basis: string;
  master_owner_name: string | null;
  composition_rights_basis: string;
  composition_owner_name: string | null;
  publisher_name: string | null;
  territory: string | null;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  one_stop_clearance: boolean | null;
  content_id_eligibility: string;
  source_reference: string | null;
  notes: string | null;
  declared_by_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function toDateOnly(value: Date | string | null): string | null {
  return toNullableIsoString(value)?.slice(0, 10) ?? null;
}

export function mapRightsDeclarationRow(
  row: RightsDeclarationRow,
): RightsDeclarationDto {
  if (
    !includes(RIGHTS_BASES, row.master_rights_basis) ||
    !includes(RIGHTS_BASES, row.composition_rights_basis) ||
    !includes(CONTENT_ID_ELIGIBILITIES, row.content_id_eligibility)
  ) {
    throw new DomainRecordError(
      "Rights Declaration contains an invalid domain value",
    );
  }
  return {
    id: row.id,
    submissionRevisionId: row.submission_revision_id,
    masterRightsBasis: row.master_rights_basis,
    masterOwnerName: row.master_owner_name,
    compositionRightsBasis: row.composition_rights_basis,
    compositionOwnerName: row.composition_owner_name,
    publisherName: row.publisher_name,
    territory: row.territory,
    validFrom: toDateOnly(row.valid_from),
    validUntil: toDateOnly(row.valid_until),
    oneStopClearance: row.one_stop_clearance,
    contentIdEligibility: row.content_id_eligibility,
    sourceReference: row.source_reference,
    notes: row.notes,
    declaredByUserId: row.declared_by_user_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}
