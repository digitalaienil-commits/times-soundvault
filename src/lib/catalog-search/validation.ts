import { z } from "zod";

import { ASSET_KINDS, VERSION_TYPES } from "@/types/domain/catalog";
import { CATALOG_SORTS } from "@/types/catalog-search";
import type { CatalogSearchInput } from "@/types/catalog-search";

export type RawCatalogSearchParams = Record<
  string,
  string | string[] | undefined
>;

export const DEFAULT_CATALOG_PAGE_SIZE = 30;
export const MAX_CATALOG_PAGE_SIZE = 60;
export const MAX_CATALOG_QUERY_LENGTH = 200;
export const MAX_CATALOG_FILTER_SELECTIONS = 50;

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const discoveryVocalStates = ["instrumental", "vocal", "mixed"] as const;
const discoveryEndingTypes = [
  "clean_stop",
  "final_hit",
  "fade",
  "open",
] as const;
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

const catalogSearchSchema = z
  .object({
    query: z.string().trim().max(MAX_CATALOG_QUERY_LENGTH),
    sort: z.enum(CATALOG_SORTS),
    page: z.number().int().min(1).max(100_000),
    pageSize: z.number().int().min(1).max(MAX_CATALOG_PAGE_SIZE),
    assetKinds: z.array(z.enum(ASSET_KINDS)),
    versionTypes: z.array(z.enum(VERSION_TYPES)),
    formats: z.array(slugSchema),
    useCases: z.array(slugSchema),
    genres: z.array(slugSchema),
    subgenres: z.array(slugSchema),
    moods: z.array(slugSchema),
    instruments: z.array(slugSchema),
    themes: z.array(slugSchema),
    festivals: z.array(slugSchema),
    characters: z.array(slugSchema),
    movements: z.array(slugSchema),
    eras: z.array(slugSchema),
    geoGenres: z.array(slugSchema),
    geoSubgenres: z.array(slugSchema),
    vocalStates: z.array(z.enum(discoveryVocalStates)),
    bpmMin: z.number().positive().max(400).nullable(),
    bpmMax: z.number().positive().max(400).nullable(),
    durationMinSeconds: z.number().min(0).max(86_400).nullable(),
    durationMaxSeconds: z.number().min(0).max(86_400).nullable(),
    keyTonic: z.string().trim().min(1).max(10).nullable(),
    keyMode: z.enum(["major", "minor"]).nullable(),
    energyMin: z.number().min(0).max(1).nullable(),
    energyMax: z.number().min(0).max(1).nullable(),
    underDialogue: z.boolean().nullable(),
    loopable: z.boolean().nullable(),
    endingTypes: z.array(z.enum(discoveryEndingTypes)),
    hasStems: z.boolean().nullable(),
    publishedAfter: dateSchema.nullable(),
    publishedBefore: dateSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.bpmMin !== null &&
      value.bpmMax !== null &&
      value.bpmMin > value.bpmMax
    ) {
      context.addIssue({
        code: "custom",
        path: ["bpmMin"],
        message: "That BPM range is not valid.",
      });
    }
    if (
      value.durationMinSeconds !== null &&
      value.durationMaxSeconds !== null &&
      value.durationMinSeconds > value.durationMaxSeconds
    ) {
      context.addIssue({
        code: "custom",
        path: ["durationMinSeconds"],
        message: "That duration range is not valid.",
      });
    }
    if (
      value.energyMin !== null &&
      value.energyMax !== null &&
      value.energyMin > value.energyMax
    ) {
      context.addIssue({
        code: "custom",
        path: ["energyMin"],
        message: "That energy range is not valid.",
      });
    }
    if (
      value.publishedAfter &&
      value.publishedBefore &&
      value.publishedAfter > value.publishedBefore
    ) {
      context.addIssue({
        code: "custom",
        path: ["publishedAfter"],
        message: "Published date range is invalid.",
      });
    }
    const taxonomySelections = [
      value.formats,
      value.useCases,
      value.genres,
      value.subgenres,
      value.moods,
      value.instruments,
      value.themes,
      value.festivals,
      value.characters,
      value.movements,
      value.eras,
      value.geoGenres,
      value.geoSubgenres,
    ].reduce((total, options) => total + options.length, 0);
    if (taxonomySelections > MAX_CATALOG_FILTER_SELECTIONS) {
      context.addIssue({
        code: "custom",
        path: ["formats"],
        message: "Too many filters were selected.",
      });
    }
  });

export class CatalogSearchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogSearchValidationError";
  }
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return [...new Set(Array.isArray(value) ? value : [value])].filter(Boolean);
}

function optionalNumber(
  value: string | string[] | undefined,
  scale = 1,
): number | null {
  const candidate = first(value);
  if (candidate === undefined || candidate === "") return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed / scale : Number.NaN;
}

function optionalBoolean(
  value: string | string[] | undefined,
): boolean | null | string {
  const candidate = first(value);
  if (candidate === undefined || candidate === "") return null;
  if (candidate === "yes") return true;
  if (candidate === "no") return false;
  return candidate;
}

export function queryHasPositiveTerm(query: string): boolean {
  const tokenPattern = /(-?)"([^"]+)"|(-?)([\p{L}\p{N}#]+)/gu;
  for (const match of query.matchAll(tokenPattern)) {
    const negative = match[1] === "-" || match[3] === "-";
    const value = (match[2] ?? match[4] ?? "").trim();
    if (!negative && value && value.toUpperCase() !== "OR") return true;
  }
  return false;
}

export function defaultCatalogSearchInput(): CatalogSearchInput {
  return {
    query: "",
    sort: "relevance",
    page: 1,
    pageSize: DEFAULT_CATALOG_PAGE_SIZE,
    assetKinds: [],
    versionTypes: [],
    formats: [],
    useCases: [],
    genres: [],
    subgenres: [],
    moods: [],
    instruments: [],
    themes: [],
    festivals: [],
    characters: [],
    movements: [],
    eras: [],
    geoGenres: [],
    geoSubgenres: [],
    vocalStates: [],
    bpmMin: null,
    bpmMax: null,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    keyTonic: null,
    keyMode: null,
    energyMin: null,
    energyMax: null,
    underDialogue: null,
    loopable: null,
    endingTypes: [],
    hasStems: null,
    publishedAfter: null,
    publishedBefore: null,
  };
}

export function parseCatalogSearchParams(
  params: RawCatalogSearchParams,
): CatalogSearchInput {
  const defaults = defaultCatalogSearchInput();
  const result = catalogSearchSchema.safeParse({
    query: first(params.q) ?? defaults.query,
    sort: first(params.sort) ?? defaults.sort,
    page: optionalNumber(params.page) ?? defaults.page,
    pageSize: optionalNumber(params.pageSize) ?? defaults.pageSize,
    assetKinds: list(params.type),
    versionTypes: list(params.version),
    formats: list(params.format),
    useCases: list(params.useCase),
    genres: list(params.genre),
    subgenres: list(params.subgenre),
    moods: list(params.mood),
    instruments: list(params.instrument),
    themes: list(params.theme),
    festivals: list(params.festival),
    characters: list(params.character),
    movements: list(params.movement),
    eras: list(params.era),
    geoGenres: list(params.geoGenre),
    geoSubgenres: list(params.geoSubgenre),
    vocalStates: list(params.vocal),
    bpmMin: optionalNumber(params.bpmMin),
    bpmMax: optionalNumber(params.bpmMax),
    durationMinSeconds: optionalNumber(params.durationMin),
    durationMaxSeconds: optionalNumber(params.durationMax),
    keyTonic: first(params.key)?.trim() || null,
    keyMode: first(params.mode)?.trim() || null,
    energyMin: optionalNumber(params.energyMin, 100),
    energyMax: optionalNumber(params.energyMax, 100),
    underDialogue: optionalBoolean(params.underDialogue),
    loopable: optionalBoolean(params.loopable),
    endingTypes: list(params.ending),
    hasStems: optionalBoolean(params.hasStems),
    publishedAfter: first(params.publishedAfter) || null,
    publishedBefore: first(params.publishedBefore) || null,
  });
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new CatalogSearchValidationError(
      issue?.message === "Invalid input"
        ? "Search filters are not valid."
        : (issue?.message ?? "Search filters are not valid."),
    );
  }
  return result.data;
}
