import type { AcceptedAudioExtension, StemType } from "@/types/uploads";

export interface GroupingFile {
  clientId: string;
  name: string;
  size: number;
  type: string;
}

export interface SuggestedFileAssignment extends GroupingFile {
  extension: AcceptedAudioExtension | null;
  groupKey: string | null;
  suggestedRole: "master" | "stem" | "unassigned";
  suggestedStemType: StemType | null;
}

const MASTER_SUFFIXES = new Set(["master", "mix", "full"]);
const STEM_SUFFIX_MAP: Readonly<Record<string, StemType>> = {
  drums: "drums",
  perc: "percussion",
  percussion: "percussion",
  bass: "bass",
  vocals: "vocals",
  vox: "vocals",
  melody: "melody",
  strings: "strings",
  brass: "brass",
  synth: "synths",
  pad: "pads",
  fx: "fx",
  impact: "impacts",
  riser: "riser",
};

export function extensionForFilename(
  filename: string,
): AcceptedAudioExtension | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".wav")) return ".wav";
  if (lower.endsWith(".mp3")) return ".mp3";
  return null;
}

export function safeFilenameBase(filename: string): string {
  const extension = extensionForFilename(filename);
  return (extension ? filename.slice(0, -extension.length) : filename)
    .normalize("NFKC")
    .replace(/[\\/\0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function humanizeWorkingTitle(filename: string): string {
  return (
    safeFilenameBase(filename)
      .replace(/[_-]+/g, " ")
      .replace(/\b(master|mix|full)\b$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Untitled track"
  );
}

export function suggestFileAssignment(
  file: GroupingFile,
): SuggestedFileAssignment {
  const extension = extensionForFilename(file.name);
  const base = safeFilenameBase(file.name);
  const match = base.match(/^(.*?)[\s_-]+([a-z0-9]+)$/i);
  if (!match) {
    return {
      ...file,
      extension,
      groupKey: null,
      suggestedRole: "unassigned",
      suggestedStemType: null,
    };
  }
  const [, prefix = "", suffix = ""] = match;
  const normalizedSuffix = suffix.toLowerCase();
  const groupKey = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!groupKey) {
    return {
      ...file,
      extension,
      groupKey: null,
      suggestedRole: "unassigned",
      suggestedStemType: null,
    };
  }
  if (MASTER_SUFFIXES.has(normalizedSuffix)) {
    return {
      ...file,
      extension,
      groupKey,
      suggestedRole: "master",
      suggestedStemType: null,
    };
  }
  const stemType = STEM_SUFFIX_MAP[normalizedSuffix];
  if (stemType) {
    return {
      ...file,
      extension,
      groupKey,
      suggestedRole: "stem",
      suggestedStemType: stemType,
    };
  }
  return {
    ...file,
    extension,
    groupKey: null,
    suggestedRole: "unassigned",
    suggestedStemType: null,
  };
}

export function isInstrumentalFullMix(filename: string): boolean {
  return /(?:^|[_\s-])instrumental(?:[_\s-]+(?:mix|full))?(?:\.[^.]+)?$/i.test(
    filename,
  );
}
