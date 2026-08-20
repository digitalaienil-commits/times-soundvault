import { z } from "zod";

import { CONTENT_ID_ELIGIBILITIES, RIGHTS_BASES } from "@/types/domain/rights";

export const rightsBasisSchema = z.enum(RIGHTS_BASES);
export const contentIdEligibilitySchema = z.enum(CONTENT_ID_ELIGIBILITIES);

export const rightsDeclarationInputSchema = z
  .object({
    masterRightsBasis: rightsBasisSchema,
    compositionRightsBasis: rightsBasisSchema,
    contentIdEligibility: contentIdEligibilitySchema.default("unknown"),
    validFrom: z.iso.date().nullable().optional(),
    validUntil: z.iso.date().nullable().optional(),
  })
  .refine(
    ({ validFrom, validUntil }) =>
      !validFrom || !validUntil || validUntil >= validFrom,
    { message: "Rights validity end date cannot precede its start date" },
  );
