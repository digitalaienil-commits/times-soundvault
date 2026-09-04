import type { QcSeverity } from "@/types/processing";

export interface TechnicalQcIssue {
  audioFileId: string | null;
  code: string;
  severity: QcSeverity;
  message: string;
  details: Record<string, unknown>;
}

export function buildFileQcIssues(input: {
  audioFileId: string;
  role: "master" | "stem";
  durationMs: number;
  containerFormat: string;
  bitDepth: number | null;
  channels: number | null;
  channelLayout: string | null;
  leadingSilenceMs: number | null;
  trailingSilenceMs: number | null;
  samplePeakDbfs: number | null;
  truePeakDbtp: number | null;
  leadingSilenceWarningMs: number;
  trailingSilenceWarningMs: number;
}): TechnicalQcIssue[] {
  const issues: TechnicalQcIssue[] = [];
  if (input.role === "master" && input.durationMs > 15 * 60 * 1000) {
    issues.push({
      audioFileId: input.audioFileId,
      code: "master_long_duration",
      severity: "warning",
      message: "Master duration is longer than the standard review target.",
      details: { durationMs: input.durationMs },
    });
  }
  if ((input.leadingSilenceMs ?? 0) > input.leadingSilenceWarningMs) {
    issues.push({
      audioFileId: input.audioFileId,
      code: "excessive_leading_silence",
      severity: "warning",
      message: `Leading silence is ${((input.leadingSilenceMs ?? 0) / 1000).toFixed(1)} seconds.`,
      details: { leadingSilenceMs: input.leadingSilenceMs },
    });
  }
  if ((input.trailingSilenceMs ?? 0) > input.trailingSilenceWarningMs) {
    issues.push({
      audioFileId: input.audioFileId,
      code: "excessive_trailing_silence",
      severity: "warning",
      message: `Trailing silence is ${((input.trailingSilenceMs ?? 0) / 1000).toFixed(1)} seconds.`,
      details: { trailingSilenceMs: input.trailingSilenceMs },
    });
  }
  if (
    (input.samplePeakDbfs != null && input.samplePeakDbfs >= -0.1) ||
    (input.truePeakDbtp != null && input.truePeakDbtp >= -0.1)
  ) {
    issues.push({
      audioFileId: input.audioFileId,
      code: "possible_clipping",
      severity: "warning",
      message:
        "Peak measurement is close to full scale; clipping may be present.",
      details: {
        samplePeakDbfs: input.samplePeakDbfs,
        truePeakDbtp: input.truePeakDbtp,
      },
    });
  }
  if (
    input.channels != null &&
    (input.channels > 2 ||
      (input.channelLayout &&
        !["mono", "stereo"].includes(input.channelLayout.toLowerCase())))
  ) {
    issues.push({
      audioFileId: input.audioFileId,
      code: "unusual_channel_layout",
      severity: "warning",
      message: "Audio uses a channel layout that needs Coordinator inspection.",
      details: {
        channels: input.channels,
        channelLayout: input.channelLayout,
      },
    });
  }
  if (input.containerFormat === "wav" && input.bitDepth == null) {
    issues.push({
      audioFileId: input.audioFileId,
      code: "missing_bit_depth",
      severity: "warning",
      message: "Bit depth could not be verified for this WAV source.",
      details: {},
    });
  }
  return issues;
}

export function buildStemAlignmentIssue(input: {
  audioFileId: string;
  masterDurationMs: number;
  stemDurationMs: number;
}): TechnicalQcIssue | null {
  const differenceMs = Math.abs(input.stemDurationMs - input.masterDurationMs);
  if (differenceMs <= 250) return null;
  return {
    audioFileId: input.audioFileId,
    code: "stem_duration_mismatch",
    severity: "warning",
    message:
      differenceMs <= 2_000
        ? `Stem differs from Master by ${(differenceMs / 1000).toFixed(2)} seconds.`
        : `Stem differs from Master by ${(differenceMs / 1000).toFixed(1)} seconds and needs close inspection.`,
    details: {
      differenceMs,
      masterDurationMs: input.masterDurationMs,
      stemDurationMs: input.stemDurationMs,
      level: differenceMs <= 2_000 ? "warning" : "high_warning",
    },
  };
}

export function possibleDuplicateIssue(input: {
  audioFileId: string;
  matchingAudioFileIds: string[];
}): TechnicalQcIssue | null {
  const matches = input.matchingAudioFileIds
    .filter((id) => id !== input.audioFileId)
    .slice(0, 20);
  if (matches.length === 0) return null;
  return {
    audioFileId: input.audioFileId,
    code: "possible_duplicate",
    severity: "warning",
    message: "Identical audio bytes already exist in SoundVault.",
    details: { matchingAudioFileIds: matches },
  };
}
