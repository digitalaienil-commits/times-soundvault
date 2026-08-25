import { z } from "zod";

import {
  ACCEPTED_AUDIO_EXTENSIONS,
  EDITORIAL_USES,
  NEWS_FORMATS,
  STEM_TYPES,
} from "@/types/uploads";

const safeText = (max: number) => z.string().trim().max(max);

export const uploadFileInputSchema = z
  .object({
    clientId: z.string().trim().min(1).max(100),
    originalFilename: z.string().min(1).max(255),
    byteSize: z.number().int().positive(),
    claimedMime: z.string().max(200),
    extension: z.enum(ACCEPTED_AUDIO_EXTENSIONS),
    role: z.enum(["master", "stem"]),
    stemType: z.enum(STEM_TYPES).optional(),
    customStemLabel: safeText(80).optional(),
    sortOrder: z.number().int().nonnegative(),
  })
  .superRefine((file, context) => {
    const lower = file.originalFilename.toLowerCase();
    if (
      !lower.endsWith(file.extension) ||
      /\.(exe|js|html|zip)\.(wav|mp3)$/i.test(lower)
    ) {
      context.addIssue({
        code: "custom",
        message: "File extension is not safe",
      });
    }
    if (/[/\\\0]/.test(file.originalFilename)) {
      context.addIssue({
        code: "custom",
        message: "Filename contains a path character",
      });
    }
    if (file.role === "master" && (file.stemType || file.customStemLabel)) {
      context.addIssue({
        code: "custom",
        message: "Master files cannot have a stem type",
      });
    }
    if (file.role === "stem" && !file.stemType) {
      context.addIssue({ code: "custom", message: "Stem type is required" });
    }
    if (file.stemType === "other" && !file.customStemLabel?.trim()) {
      context.addIssue({
        code: "custom",
        message: "A custom label is required for Other stems",
      });
    }
  });

export const producerMetadataSchema = z.object({
  workingTitle: safeText(500).min(1),
  description: safeText(3000).optional(),
  producerNotes: safeText(5000).optional(),
  internalSourceReference: safeText(1000).optional(),
  format: z.enum(NEWS_FORMATS).optional(),
  editorialUses: z
    .array(z.enum(EDITORIAL_USES))
    .max(EDITORIAL_USES.length)
    .optional(),
  underDialogue: z.enum(["yes", "no", "unknown"]).optional(),
  loopable: z.enum(["yes", "no", "unknown"]).optional(),
  endingType: z
    .enum(["clean_stop", "final_hit", "fade", "open", "unknown"])
    .optional(),
});

export const rightsDraftSchema = z
  .object({
    masterRightsBasis: z.enum([
      "owned",
      "exclusive_license",
      "non_exclusive_license",
      "unknown",
    ]),
    masterOwnerName: safeText(300).optional(),
    compositionRightsBasis: z.enum([
      "owned",
      "exclusive_license",
      "non_exclusive_license",
      "unknown",
    ]),
    compositionOwnerName: safeText(300).optional(),
    publisherName: safeText(300).optional(),
    territory: safeText(200).optional(),
    validFrom: z.iso.date().optional(),
    validUntil: z.iso.date().optional(),
    sourceReference: safeText(1000).optional(),
    notes: safeText(5000).optional(),
    oneStopClearance: z.boolean().optional(),
    contentIdEligibility: z
      .enum(["unknown", "eligible", "ineligible", "needs_review"])
      .default("unknown"),
  })
  .refine(
    ({ validFrom, validUntil }) =>
      !validFrom || !validUntil || validUntil >= validFrom,
    { message: "Rights validity end date cannot precede its start date" },
  );

export const trackPackageDraftSchema = z.object({
  clientId: z.string().trim().min(1).max(100),
  workingTitle: safeText(500).min(1),
  files: z.array(uploadFileInputSchema).min(1),
  producerMetadata: producerMetadataSchema,
  rights: rightsDraftSchema,
});

export const createUploadBatchSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    revisionSubmissionId: z.uuid().optional(),
    label: safeText(300).optional(),
    acknowledgementAccepted: z.boolean(),
    packages: z.array(trackPackageDraftSchema).min(1),
  })
  .refine(
    ({ revisionSubmissionId, packages }) =>
      !revisionSubmissionId || packages.length === 1,
    { message: "A revision upload must contain exactly one Track package" },
  );

export function validateUploadBatchLimits(
  input: z.infer<typeof createUploadBatchSchema>,
  limits: {
    maxFileBytes: number;
    maxBatchBytes: number;
    maxTracksPerBatch: number;
    maxStemsPerTrack: number;
  },
): void {
  if (input.packages.length > limits.maxTracksPerBatch) {
    throw new Error(
      `A batch can contain at most ${limits.maxTracksPerBatch} tracks`,
    );
  }
  let batchBytes = 0;
  for (const packageInput of input.packages) {
    const masters = packageInput.files.filter((file) => file.role === "master");
    const stems = packageInput.files.filter((file) => file.role === "stem");
    if (masters.length !== 1)
      throw new Error("Every track requires exactly one master");
    if (stems.length > limits.maxStemsPerTrack) {
      throw new Error(
        `A track can contain at most ${limits.maxStemsPerTrack} stems`,
      );
    }
    for (const file of packageInput.files) {
      if (file.byteSize > limits.maxFileBytes)
        throw new Error("A selected file is too large");
      batchBytes += file.byteSize;
    }
  }
  if (batchBytes > limits.maxBatchBytes)
    throw new Error("The selected batch is too large");
}

export function contentTypeForExtension(extension: ".wav" | ".mp3"): string {
  return extension === ".wav" ? "audio/wav" : "audio/mpeg";
}
