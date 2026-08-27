import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";

import { getDatabase } from "@/lib/database/database";
import { TAXONOMY_CATEGORIES } from "@/types/domain/metadata";
import type { TaxonomyCategory } from "@/types/domain/metadata";

import { recordAdminAuditEvent } from "./audit";

export interface AdminTaxonomyTerm {
  id: string;
  category: TaxonomyCategory;
  slug: string;
  label: string;
  description: string | null;
  parentTermId: string | null;
  isActive: boolean;
  sortOrder: number;
  usageCount: number;
  aliasCount: number;
  updatedAt: Date;
}

interface TermRow extends QueryResultRow {
  id: string;
  category: TaxonomyCategory;
  slug: string;
  label: string;
  description: string | null;
  parent_term_id: string | null;
  is_active: boolean;
  sort_order: number;
  usage_count: string;
  alias_count: string;
  updated_at: Date;
}

export const taxonomyTermInputSchema = z.object({
  category: z.enum(TAXONOMY_CATEGORIES),
  label: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(1000).optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

export function toTaxonomySlug(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function mapTerm(row: TermRow): AdminTaxonomyTerm {
  return {
    id: row.id,
    category: row.category,
    slug: row.slug,
    label: row.label,
    description: row.description,
    parentTermId: row.parent_term_id,
    isActive: row.is_active,
    sortOrder: Number(row.sort_order),
    usageCount: Number(row.usage_count),
    aliasCount: Number(row.alias_count),
    updatedAt: row.updated_at,
  };
}

async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listAdminTaxonomyTerms(
  filters: { category?: string; search?: string } = {},
): Promise<AdminTaxonomyTerm[]> {
  const values: string[] = [];
  const conditions: string[] = [];
  if (TAXONOMY_CATEGORIES.includes(filters.category as TaxonomyCategory)) {
    values.push(filters.category as string);
    conditions.push(`term.category = $${values.length}`);
  }
  if (filters.search?.trim()) {
    values.push(`%${filters.search.trim()}%`);
    conditions.push(
      `(term.label ILIKE $${values.length} OR term.slug ILIKE $${values.length})`,
    );
  }
  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await getDatabase().query<TermRow>(
    `SELECT term.*,
       count(DISTINCT assignment.id)::text AS usage_count,
       count(DISTINCT alias.id)::text AS alias_count
     FROM catalog.taxonomy_term term
     LEFT JOIN catalog.track_term_assignment assignment ON assignment.term_id = term.id
     LEFT JOIN catalog.taxonomy_term_alias alias ON alias.term_id = term.id
     ${where}
     GROUP BY term.id
     ORDER BY term.category, term.is_active DESC, term.sort_order, term.label
     LIMIT 250`,
    values,
  );
  return result.rows.map(mapTerm);
}

export async function createAdminTaxonomyTerm(input: {
  category: TaxonomyCategory;
  label: string;
  slug: string;
  description?: string | null;
  sortOrder: number;
  actorUserId: string;
}): Promise<AdminTaxonomyTerm> {
  const parsed = taxonomyTermInputSchema.parse(input);
  return withTransaction(getDatabase(), async (client) => {
    const id = randomUUID();
    const inserted = await client.query<TermRow>(
      `INSERT INTO catalog.taxonomy_term (
         id, category, slug, label, description, sort_order, updated_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *, '0'::text AS usage_count, '0'::text AS alias_count`,
      [
        id,
        parsed.category,
        parsed.slug,
        parsed.label,
        parsed.description || null,
        parsed.sortOrder,
        input.actorUserId,
      ],
    );
    await recordAdminAuditEvent(client, {
      actorUserId: input.actorUserId,
      subjectType: "taxonomy",
      subjectId: id,
      action: "taxonomy_term_created",
      metadata: {
        category: parsed.category,
        slug: parsed.slug,
        label: parsed.label,
      },
    });
    return mapTerm(inserted.rows[0]!);
  });
}

export async function setAdminTaxonomyTermState(input: {
  termId: string;
  active: boolean;
  actorUserId: string;
}) {
  const termId = z.string().uuid().parse(input.termId);
  return withTransaction(getDatabase(), async (client) => {
    const result = await client.query<TermRow>(
      `UPDATE catalog.taxonomy_term
       SET is_active = $2,
           deactivated_at = CASE WHEN $2 = false THEN now() ELSE NULL END,
           deactivated_by_user_id = CASE WHEN $2 = false THEN $3 ELSE NULL END,
           updated_by_user_id = $3,
           updated_at = now()
       WHERE id = $1
       RETURNING *,
         (SELECT count(*)::text FROM catalog.track_term_assignment assignment WHERE assignment.term_id = catalog.taxonomy_term.id) AS usage_count,
         (SELECT count(*)::text FROM catalog.taxonomy_term_alias alias WHERE alias.term_id = catalog.taxonomy_term.id) AS alias_count`,
      [termId, input.active, input.actorUserId],
    );
    const term = result.rows[0];
    if (!term) throw new Error("Taxonomy term was not found");
    await recordAdminAuditEvent(client, {
      actorUserId: input.actorUserId,
      subjectType: "taxonomy",
      subjectId: termId,
      action: input.active
        ? "taxonomy_term_reactivated"
        : "taxonomy_term_deactivated",
      metadata: {
        category: term.category,
        slug: term.slug,
        historicalAssignmentsPreserved: true,
      },
    });
    return mapTerm(term);
  });
}
