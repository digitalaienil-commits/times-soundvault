import { z } from "zod";

import { ASSET_KINDS } from "@/types/domain/catalog";
import { TAXONOMY_CATEGORIES } from "@/types/domain/metadata";
import {
  DEMAND_PRIORITIES,
  DEMAND_RESPONSE_STATUSES,
  DEMAND_STATUSES,
} from "@/types/demands";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();
const optionalNumber = (schema: z.ZodType<number, unknown>) =>
  z.union([schema, z.null()]).optional();

export const demandTermInputSchema = z.object({
  termId: z.uuid(),
  importance: z.enum(["required", "preferred"]),
});

export const demandInputSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    requesterName: optionalText(120),
    requestingTeam: optionalText(120),
    projectContext: z.string().trim().min(3).max(300),
    brief: z.string().trim().min(20).max(5000),
    creativeNotes: optionalText(3000),
    avoidNotes: optionalText(2000),
    priority: z.enum(DEMAND_PRIORITIES),
    assetKind: z.enum(ASSET_KINDS),
    targetTrackCount: z.coerce.number().int().min(1).max(25),
    responseDeadlineOn: z.iso.date(),
    neededByOn: z.iso.date(),
    bpmMin: optionalNumber(z.coerce.number().positive().max(400)),
    bpmMax: optionalNumber(z.coerce.number().positive().max(400)),
    durationMinMs: optionalNumber(
      z.coerce.number().int().positive().max(21_600_000),
    ),
    durationMaxMs: optionalNumber(
      z.coerce.number().int().positive().max(21_600_000),
    ),
    vocalState: z
      .enum(["instrumental", "vocal", "mixed"])
      .nullable()
      .optional(),
    underDialogue: z.boolean().nullable().optional(),
    loopable: z.boolean().nullable().optional(),
    stemsRequired: z.boolean().default(false),
    endingType: z
      .enum(["clean_stop", "final_hit", "fade", "open"])
      .nullable()
      .optional(),
    ownerUserId: z.string().trim().min(1),
    termRequirements: z.array(demandTermInputSchema).max(100).default([]),
    assigneeUserIds: z.array(z.string().trim().min(1)).max(50).default([]),
    referenceTrackIds: z.array(z.uuid()).max(25).default([]),
  })
  .superRefine((value, context) => {
    if (value.responseDeadlineOn > value.neededByOn)
      context.addIssue({
        code: "custom",
        path: ["responseDeadlineOn"],
        message: "Response deadline must be on or before the needed-by date.",
      });
    if (
      value.bpmMin != null &&
      value.bpmMax != null &&
      value.bpmMin > value.bpmMax
    )
      context.addIssue({
        code: "custom",
        path: ["bpmMax"],
        message: "Maximum BPM must be at least the minimum BPM.",
      });
    if (
      value.durationMinMs != null &&
      value.durationMaxMs != null &&
      value.durationMinMs > value.durationMaxMs
    )
      context.addIssue({
        code: "custom",
        path: ["durationMaxMs"],
        message: "Maximum duration must be at least the minimum duration.",
      });
    const terms = new Set<string>();
    for (const requirement of value.termRequirements) {
      if (terms.has(requirement.termId))
        context.addIssue({
          code: "custom",
          path: ["termRequirements"],
          message: "A taxonomy requirement may be selected only once.",
        });
      terms.add(requirement.termId);
    }
  });

export const demandCreateSchema = demandInputSchema.extend({
  intent: z.enum(["draft", "open"]),
});

export const demandUpdateSchema = demandInputSchema.extend({
  demandId: z.uuid(),
  rowVersion: z.coerce.number().int().positive(),
});

export const demandTransitionSchema = z.object({
  demandId: z.uuid(),
  rowVersion: z.coerce.number().int().positive(),
  nextStatus: z.enum(DEMAND_STATUSES),
  reason: z.string().trim().max(1000).optional(),
});

export const demandResponseInputSchema = z.object({
  demandId: z.uuid(),
  trackId: z.uuid(),
  pitchNote: z.string().trim().max(1000).optional(),
});

export const responseMutationSchema = z.object({
  demandId: z.uuid(),
  responseId: z.uuid(),
  rowVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
});

export const demandListFiltersSchema = z.object({
  query: z.string().trim().max(120).default(""),
  status: z.enum(["all", ...DEMAND_STATUSES]).default("open"),
  priority: z.enum(["all", ...DEMAND_PRIORITIES]).default("all"),
  ownerUserId: z.string().trim().min(1).default("all"),
  timing: z.enum(["all", "overdue", "due_soon"]).default("all"),
  assignedToMe: z.coerce.boolean().default(false),
  myResponse: z.enum(["all", ...DEMAND_RESPONSE_STATUSES]).default("all"),
  sort: z
    .enum(["priority", "response_deadline", "needed_by", "newest", "oldest"])
    .default("priority"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(30),
});

export const demandTaxonomyCategorySchema = z.enum(TAXONOMY_CATEGORIES);

export type DemandInput = z.infer<typeof demandInputSchema>;

export function hasMeaningfulCreativeRequirement(input: DemandInput): boolean {
  return Boolean(
    input.termRequirements.length ||
    input.bpmMin ||
    input.bpmMax ||
    input.durationMinMs ||
    input.durationMaxMs ||
    input.vocalState ||
    (input.underDialogue !== null && input.underDialogue !== undefined) ||
    (input.loopable !== null && input.loopable !== undefined) ||
    input.stemsRequired ||
    input.endingType,
  );
}

export function hasMusicUseCaseOrFormat(
  input: DemandInput,
  categories: ReadonlyMap<string, string>,
): boolean {
  return (
    input.assetKind !== "music" ||
    input.termRequirements.some(({ termId }) => {
      const category = categories.get(termId);
      return category === "use_case" || category === "format";
    })
  );
}
