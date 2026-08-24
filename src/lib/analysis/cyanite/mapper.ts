import type { NormalizedAnalysisResult } from "@/types/processing";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown, limit = 20): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 100))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown, limit = 1_000): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, limit)
    : null;
}

export function normalizeCyaniteV7Result(
  raw: Record<string, unknown>,
): NormalizedAnalysisResult {
  const bpm = object(raw.bpmPrediction);
  const key = object(raw.keyPrediction);
  const segments = object(raw.segments);
  const timestamps = Array.isArray(segments.timestamps)
    ? segments.timestamps.filter(
        (item): item is number => typeof item === "number" && item >= 0,
      )
    : [];
  const valence = Array.isArray(segments.valence) ? segments.valence : [];
  const arousal = Array.isArray(segments.arousal) ? segments.arousal : [];
  const boundedTimestamps = timestamps.slice(0, 121);
  const normalizedSegments = boundedTimestamps
    .slice(0, -1)
    .map((start, index) => ({
      startSeconds: start,
      endSeconds: boundedTimestamps[index + 1] ?? start,
      ...(numberOrNull(valence[index]) == null
        ? {}
        : { valence: numberOrNull(valence[index])! }),
      ...(numberOrNull(arousal[index]) == null
        ? {}
        : { arousal: numberOrNull(arousal[index])! }),
    }));
  const freeGenres =
    stringOrNull(raw.freeGenreTags, 1_000)
      ?.split(/[,;]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 20) ?? [];
  const voiceTags = strings(raw.voiceTags);
  return {
    genres: strings(raw.advancedGenreTags),
    subgenres: strings(raw.advancedSubgenreTags),
    moods: [
      ...new Set([...strings(raw.moodTags), ...strings(raw.moodAdvancedTags)]),
    ].slice(0, 20),
    instruments: [
      ...new Set([
        ...strings(raw.advancedInstrumentTags),
        ...strings(raw.advancedInstrumentTagsExtended),
      ]),
    ].slice(0, 30),
    bpm: numberOrNull(bpm.value),
    bpmRangeAdjusted: numberOrNull(raw.bpmRangeAdjusted),
    key: stringOrNull(key.value, 80),
    timeSignature: stringOrNull(raw.timeSignature, 20),
    energy: numberOrNull(raw.energyLevel) ?? stringOrNull(raw.energyLevel, 80),
    energyDynamics: stringOrNull(raw.energyDynamics, 80),
    valence: numberOrNull(raw.valence),
    arousal: numberOrNull(raw.arousal),
    vocalState: voiceTags[0] ?? stringOrNull(raw.voicePresenceProfile, 80),
    voiceTags,
    voiceoverExists:
      typeof raw.voiceoverExists === "boolean" ? raw.voiceoverExists : null,
    voiceoverDegree: numberOrNull(raw.voiceoverDegree),
    character: strings(raw.characterTags),
    movement: strings(raw.movementTags),
    musicalEra: stringOrNull(raw.musicalEraTag, 100),
    transformerCaption: stringOrNull(raw.transformerCaption, 1_000),
    freeGenreTags: freeGenres,
    segmentIntervalSeconds:
      boundedTimestamps.length > 1
        ? boundedTimestamps[1]! - boundedTimestamps[0]!
        : null,
    segments: normalizedSegments,
  };
}

function boundValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (typeof value === "string") return value.slice(0, 2_000);
  if (typeof value === "number" || typeof value === "boolean" || value == null)
    return value;
  if (Array.isArray(value))
    return value.slice(0, 200).map((item) => boundValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [key.slice(0, 100), boundValue(item, depth + 1)]),
    );
  }
  return null;
}

export function boundCyaniteRawResult(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const bounded = boundValue(value) as Record<string, unknown>;
  const encoded = JSON.stringify(bounded);
  if (Buffer.byteLength(encoded, "utf8") > 512 * 1024) {
    throw new Error("Cyanite result exceeds the bounded retention limit");
  }
  return bounded;
}
