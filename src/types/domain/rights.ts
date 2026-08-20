export const RIGHTS_BASES = [
  "owned",
  "exclusive_license",
  "non_exclusive_license",
  "unknown",
] as const;
export type RightsBasis = (typeof RIGHTS_BASES)[number];

export const CONTENT_ID_ELIGIBILITIES = [
  "unknown",
  "eligible",
  "ineligible",
  "needs_review",
] as const;
export type ContentIdEligibility = (typeof CONTENT_ID_ELIGIBILITIES)[number];

export interface RightsDeclarationDto {
  id: string;
  submissionRevisionId: string;
  masterRightsBasis: RightsBasis;
  masterOwnerName: string | null;
  compositionRightsBasis: RightsBasis;
  compositionOwnerName: string | null;
  publisherName: string | null;
  territory: string | null;
  validFrom: string | null;
  validUntil: string | null;
  oneStopClearance: boolean | null;
  contentIdEligibility: ContentIdEligibility;
  sourceReference: string | null;
  notes: string | null;
  declaredByUserId: string;
  createdAt: string;
  updatedAt: string;
}
