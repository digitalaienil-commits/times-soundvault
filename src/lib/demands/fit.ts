import type { AssetKind } from "@/types/domain/catalog";
import type { EndingType, VocalState } from "@/types/domain/metadata";
import type { DemandFitResult, DemandTermRequirement } from "@/types/demands";

export interface DemandFitDemand {
  assetKind: AssetKind;
  bpmMin: number | null;
  bpmMax: number | null;
  durationMinMs: number | null;
  durationMaxMs: number | null;
  vocalState: Exclude<VocalState, "unknown"> | null;
  underDialogue: boolean | null;
  loopable: boolean | null;
  stemsRequired: boolean;
  endingType: Exclude<EndingType, "unknown"> | null;
  requirements: DemandTermRequirement[];
}

export interface DemandFitTrack {
  assetKind: AssetKind;
  bpm: number | null;
  durationMs: number | null;
  vocalState: VocalState | null;
  underDialogue: boolean | null;
  loopable: boolean | null;
  stemCount: number;
  endingType: EndingType | null;
  acceptedTermIds: readonly string[];
}

export function evaluateTrackAgainstDemand(
  demand: DemandFitDemand,
  track: DemandFitTrack,
): DemandFitResult {
  const requiredMatches: string[] = [];
  const requiredMismatches: DemandFitResult["requiredMismatches"] = [];
  const preferredMatches: string[] = [];
  const preferredMissing: string[] = [];
  const warnings: string[] = [];
  const mismatch = (
    code: string,
    label: string,
    expected: string,
    actual: string,
  ) => requiredMismatches.push({ code, label, expected, actual });
  const required = (
    ok: boolean,
    code: string,
    label: string,
    expected: string,
    actual: string,
  ) =>
    ok ? requiredMatches.push(label) : mismatch(code, label, expected, actual);

  required(
    demand.assetKind === track.assetKind,
    "asset_kind",
    "Asset kind",
    demand.assetKind,
    track.assetKind,
  );
  if (demand.bpmMin != null)
    required(
      track.bpm != null && track.bpm >= demand.bpmMin,
      "bpm_min",
      "Minimum BPM",
      String(demand.bpmMin),
      track.bpm == null ? "Missing" : String(track.bpm),
    );
  if (demand.bpmMax != null)
    required(
      track.bpm != null && track.bpm <= demand.bpmMax,
      "bpm_max",
      "Maximum BPM",
      String(demand.bpmMax),
      track.bpm == null ? "Missing" : String(track.bpm),
    );
  if (demand.durationMinMs != null)
    required(
      track.durationMs != null && track.durationMs >= demand.durationMinMs,
      "duration_min",
      "Minimum duration",
      `${demand.durationMinMs} ms`,
      track.durationMs == null ? "Missing" : `${track.durationMs} ms`,
    );
  if (demand.durationMaxMs != null)
    required(
      track.durationMs != null && track.durationMs <= demand.durationMaxMs,
      "duration_max",
      "Maximum duration",
      `${demand.durationMaxMs} ms`,
      track.durationMs == null ? "Missing" : `${track.durationMs} ms`,
    );
  if (demand.vocalState != null)
    required(
      track.vocalState === demand.vocalState,
      "vocal_state",
      "Vocal state",
      demand.vocalState,
      track.vocalState ?? "Missing",
    );
  if (demand.underDialogue != null)
    required(
      track.underDialogue === demand.underDialogue,
      "under_dialogue",
      "Under dialogue",
      demand.underDialogue ? "Yes" : "No",
      track.underDialogue == null
        ? "Missing"
        : track.underDialogue
          ? "Yes"
          : "No",
    );
  if (demand.loopable != null)
    required(
      track.loopable === demand.loopable,
      "loopable",
      "Loopable",
      demand.loopable ? "Yes" : "No",
      track.loopable == null ? "Missing" : track.loopable ? "Yes" : "No",
    );
  if (demand.stemsRequired)
    required(
      track.stemCount > 0,
      "stems",
      "Stems",
      "Required",
      track.stemCount ? `${track.stemCount} available` : "None",
    );
  if (demand.endingType != null)
    required(
      track.endingType === demand.endingType,
      "ending_type",
      "Ending",
      demand.endingType,
      track.endingType ?? "Missing",
    );

  const accepted = new Set(track.acceptedTermIds);
  for (const term of demand.requirements) {
    if (term.importance === "required") {
      if (!term.active)
        mismatch(
          "inactive_term",
          term.label,
          "Active requirement",
          "Inactive requirement — update the Demand",
        );
      else
        required(
          accepted.has(term.termId),
          `term:${term.termId}`,
          term.label,
          "Required taxonomy term",
          "Not accepted canonically",
        );
    } else if (accepted.has(term.termId)) preferredMatches.push(term.label);
    else preferredMissing.push(term.label);
  }
  if (track.bpm == null && (demand.bpmMin != null || demand.bpmMax != null))
    warnings.push("Track BPM is missing from canonical metadata.");
  return {
    eligibleForAcceptance: requiredMismatches.length === 0,
    requiredMatches,
    requiredMismatches,
    preferredMatches,
    preferredMissing,
    warnings,
  };
}
