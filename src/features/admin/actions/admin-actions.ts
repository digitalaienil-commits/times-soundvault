"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdminOperation } from "@/lib/admin/authorization";
import {
  enqueueAdminMaintenanceJob,
  reclaimExpiredProcessingJobs,
} from "@/lib/admin/maintenance";
import {
  createAdminTaxonomyTerm,
  setAdminTaxonomyTermState,
  taxonomyTermInputSchema,
  toTaxonomySlug,
} from "@/lib/admin/taxonomy";

function resultUrl(path: string, kind: "notice" | "error", message: string) {
  return `${path}?${kind}=${encodeURIComponent(message)}`;
}

function safeError(error: unknown) {
  if (error instanceof z.ZodError) {
    return "Check the submitted values and try again.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "The admin operation could not be completed safely.";
}

export async function createTaxonomyTermAction(formData: FormData) {
  const actor = await requireAdminOperation("/admin/taxonomy");
  let destination: string;
  try {
    const label = String(formData.get("label") ?? "");
    const rawSlug = String(formData.get("slug") ?? "");
    const input = taxonomyTermInputSchema.parse({
      category: formData.get("category"),
      label,
      slug: rawSlug.trim() ? rawSlug : toTaxonomySlug(label),
      description: formData.get("description") || undefined,
      sortOrder: formData.get("sortOrder") || 0,
    });
    await createAdminTaxonomyTerm({
      ...input,
      actorUserId: actor.id,
    });
    destination = resultUrl(
      "/admin/taxonomy",
      "notice",
      "Taxonomy term created. It is available for new selection.",
    );
  } catch (error) {
    destination = resultUrl("/admin/taxonomy", "error", safeError(error));
  }
  revalidatePath("/admin/taxonomy");
  redirect(destination);
}

export async function setTaxonomyTermStateAction(formData: FormData) {
  const actor = await requireAdminOperation("/admin/taxonomy");
  let destination: string;
  try {
    const input = z
      .object({
        termId: z.string().uuid(),
        operation: z.enum(["deactivate", "reactivate"]),
      })
      .parse({
        termId: formData.get("termId"),
        operation: formData.get("operation"),
      });
    await setAdminTaxonomyTermState({
      termId: input.termId,
      active: input.operation === "reactivate",
      actorUserId: actor.id,
    });
    destination = resultUrl(
      "/admin/taxonomy",
      "notice",
      input.operation === "reactivate"
        ? "Taxonomy term reactivated for new selection."
        : "Taxonomy term deactivated. Historical assignments were preserved.",
    );
  } catch (error) {
    destination = resultUrl("/admin/taxonomy", "error", safeError(error));
  }
  revalidatePath("/admin/taxonomy");
  redirect(destination);
}

export async function queueMaintenanceJobAction(formData: FormData) {
  const actor = await requireAdminOperation("/admin");
  const destinationPath = String(formData.get("returnTo") || "/admin");
  let destination: string;
  try {
    const input = z
      .object({
        jobType: z.enum([
          "system_health_check",
          "search_rebuild",
          "media_reconcile",
          "processing_reclaim",
          "retention_dry_run",
          "retention_cleanup",
          "catalog_integrity_scan",
        ]),
        subjectType: z.enum([
          "system",
          "catalog",
          "processing",
          "media",
          "retention",
          "integrity",
        ]),
        requestSummary: z.string().trim().min(3).max(500),
        dryRun: z.enum(["true", "false"]).default("true"),
        maxScope: z.coerce.number().int().min(1).max(10000).default(25),
      })
      .parse({
        jobType: formData.get("jobType"),
        subjectType: formData.get("subjectType"),
        requestSummary: formData.get("requestSummary"),
        dryRun: formData.get("dryRun") ?? "true",
        maxScope: formData.get("maxScope") ?? 25,
      });
    await enqueueAdminMaintenanceJob({
      ...input,
      dryRun: input.dryRun === "true",
      actorUserId: actor.id,
    });
    destination = resultUrl(
      destinationPath,
      "notice",
      "Maintenance job queued for the admin worker.",
    );
  } catch (error) {
    destination = resultUrl(destinationPath, "error", safeError(error));
  }
  revalidatePath(destinationPath);
  redirect(destination);
}

export async function reclaimExpiredJobsAction(formData: FormData) {
  const actor = await requireAdminOperation("/admin/processing");
  const destinationPath = String(
    formData.get("returnTo") || "/admin/processing",
  );
  let destination: string;
  try {
    const result = await reclaimExpiredProcessingJobs(actor.id);
    destination = resultUrl(
      destinationPath,
      "notice",
      `Reclaimed ${result.processingJobs} processing and ${result.mediaJobs} media jobs with expired leases.`,
    );
  } catch (error) {
    destination = resultUrl(destinationPath, "error", safeError(error));
  }
  revalidatePath(destinationPath);
  redirect(destination);
}
