import { createHash } from "node:crypto";

export interface CanonicalMetadataInput {
  trackId: string;
  title: string;
  versionLabel?: string | null;
  versionType?: string | null;
  description?: string | null;
  descriptionCaption?: string | null;
  assetKind?: string | null;
  bpm?: number | null;
  keyTonic?: string | null;
  keyMode?: string | null;
  energyScore?: number | null;
  vocalState?: string | null;
  languageCode?: string | null;
  underDialogue?: boolean | null;
  loopable?: boolean | null;
  endingType?: string | null;
  stemCount?: number | null;
  timeSignature?: string | null;
  era?: string | null;
  terms?: Array<{
    category: string;
    slug: string;
    label: string;
  }>;
}

export interface CanonicalEmbeddingDocument {
  trackId: string;
  canonicalText: string;
  inputHash: string;
}

/**
 * Deterministically constructs a structured canonical text representation of a published track's
 * approved metadata and active taxonomy for embedding generation.
 *
 * Excludes all secrets, internal review notes, copyright details, audit trails, and raw provider JSON.
 */
export function buildCanonicalEmbeddingText(
  metadata: CanonicalMetadataInput,
): string {
  const lines: string[] = [];

  // Title and core identification
  lines.push(`Title: ${metadata.title.trim()}`);
  if (metadata.versionLabel?.trim()) {
    lines.push(`Version: ${metadata.versionLabel.trim()}`);
  } else if (metadata.versionType?.trim()) {
    lines.push(`Version: ${metadata.versionType.trim().replaceAll("_", " ")}`);
  }

  // Editorial description and caption
  if (metadata.description?.trim()) {
    lines.push(`Description: ${metadata.description.trim()}`);
  }
  if (
    metadata.descriptionCaption?.trim() &&
    metadata.descriptionCaption.trim() !== metadata.description?.trim()
  ) {
    lines.push(`Caption: ${metadata.descriptionCaption.trim()}`);
  }

  // Group accepted taxonomy terms by category deterministically
  if (metadata.terms && metadata.terms.length > 0) {
    const categoryMap = new Map<string, string[]>();
    for (const term of metadata.terms) {
      const category = term.category.trim().toLowerCase();
      const current = categoryMap.get(category) ?? [];
      current.push(term.label.trim());
      categoryMap.set(category, current);
    }

    // Sort categories alphabetically
    const sortedCategories = Array.from(categoryMap.keys()).sort();
    for (const cat of sortedCategories) {
      const labels = categoryMap.get(cat)!;
      // Sort labels alphabetically and deduplicate
      const uniqueLabels = Array.from(new Set(labels)).sort();
      const formattedCategory =
        cat.charAt(0).toUpperCase() + cat.slice(1).replaceAll("_", " ");
      lines.push(`${formattedCategory}: ${uniqueLabels.join(", ")}`);
    }
  }

  // Musical attributes
  const musicalParts: string[] = [];
  if (metadata.bpm !== null && metadata.bpm !== undefined) {
    musicalParts.push(`${Math.round(metadata.bpm)} BPM`);
  }
  if (metadata.keyTonic) {
    musicalParts.push(
      `Key of ${metadata.keyTonic} ${metadata.keyMode ?? ""}`.trim(),
    );
  }
  if (metadata.timeSignature) {
    musicalParts.push(`Meter ${metadata.timeSignature}`);
  }
  if (metadata.energyScore !== null && metadata.energyScore !== undefined) {
    musicalParts.push(`Energy ${metadata.energyScore}/10`);
  }
  if (musicalParts.length > 0) {
    lines.push(`Musical: ${musicalParts.join("; ")}`);
  }

  // Vocal and language characteristics
  const vocalParts: string[] = [];
  if (metadata.vocalState) {
    vocalParts.push(`Vocals: ${metadata.vocalState.replaceAll("_", " ")}`);
  }
  if (metadata.languageCode) {
    vocalParts.push(`Language: ${metadata.languageCode}`);
  }
  if (vocalParts.length > 0) {
    lines.push(vocalParts.join("; "));
  }

  // Production and structural traits
  const productionParts: string[] = [];
  if (metadata.underDialogue === true) {
    productionParts.push("suitable under dialogue");
  }
  if (metadata.loopable === true) {
    productionParts.push("seamlessly loopable");
  }
  if (metadata.endingType) {
    productionParts.push(`${metadata.endingType.replaceAll("_", " ")} ending`);
  }
  if (
    metadata.stemCount !== null &&
    metadata.stemCount !== undefined &&
    metadata.stemCount > 0
  ) {
    productionParts.push(`${metadata.stemCount} stems available`);
  }
  if (metadata.era) {
    productionParts.push(`Era: ${metadata.era}`);
  }
  if (productionParts.length > 0) {
    lines.push(`Production: ${productionParts.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Computes a deterministic SHA-256 hash of the canonical embedding input text.
 */
export function computeCanonicalInputHash(canonicalText: string): string {
  return createHash("sha256").update(canonicalText, "utf8").digest("hex");
}

/**
 * Produces the complete canonical document packet for embedding generation and change detection.
 */
export function buildCanonicalEmbeddingDocument(
  metadata: CanonicalMetadataInput,
): CanonicalEmbeddingDocument {
  const canonicalText = buildCanonicalEmbeddingText(metadata);
  const inputHash = computeCanonicalInputHash(canonicalText);
  return {
    trackId: metadata.trackId,
    canonicalText,
    inputHash,
  };
}
