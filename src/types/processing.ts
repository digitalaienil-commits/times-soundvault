export type TechnicalStatus = "pending" | "processing" | "complete" | "failed";
export type AiAnalysisStatus =
  | "not_started"
  | "disabled"
  | "preparing"
  | "uploading"
  | "analyzing"
  | "complete"
  | "failed"
  | "skipped_unsupported_duration";
export type AnalysisOverallStatus =
  | "queued"
  | "processing"
  | "waiting_provider"
  | "complete"
  | "partial"
  | "failed";
export type ProcessingJobType =
  "revision_processing" | "legacy_ai_result_fetch";
export type ProcessingJobStatus =
  "queued" | "running" | "retry_wait" | "succeeded" | "failed" | "cancelled";
export type QcSeverity = "info" | "warning" | "error";

export interface ProcessingJobDto {
  id: string;
  jobType: ProcessingJobType;
  submissionId: string;
  submissionRevisionId: string;
  status: ProcessingJobStatus;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface QcIssueDto {
  id: string;
  audioFileId: string | null;
  code: string;
  severity: QcSeverity;
  message: string;
  details: Record<string, unknown>;
}

export interface FileTechnicalResultDto {
  audioFileId: string;
  assetRole: "master" | "stem";
  stemType: string | null;
  displayTitle: string;
  originalFilename: string;
  sha256: string;
  durationMs: number;
  containerFormat: string;
  codec: string;
  bitRateBps: number | null;
  sampleRateHz: number | null;
  bitDepth: number | null;
  channels: number | null;
  channelLayout: string | null;
  integratedLoudnessLufs: number | null;
  loudnessRangeLu: number | null;
  truePeakDbtp: number | null;
  samplePeakDbfs: number | null;
  leadingSilenceMs: number | null;
  trailingSilenceMs: number | null;
  embeddedTags: Record<string, string>;
  issues: QcIssueDto[];
}

export interface NormalizedAnalysisResult {
  genres: string[];
  subgenres: string[];
  moods: string[];
  instruments: string[];
  bpm: number | null;
  bpmRangeAdjusted: number | null;
  key: string | null;
  timeSignature: string | null;
  energy: string | number | null;
  energyDynamics: string | null;
  valence: number | null;
  arousal: number | null;
  vocalState: string | null;
  voiceTags: string[];
  voiceoverExists: boolean | null;
  voiceoverDegree: number | null;
  character: string[];
  movement: string[];
  musicalEra: string | null;
  transformerCaption: string | null;
  freeGenreTags: string[];
  segmentIntervalSeconds: number | null;
  segments: Array<{
    startSeconds: number;
    endSeconds: number;
    valence?: number;
    arousal?: number;
  }>;
}

export interface ProcessingAnalysisDto {
  id: string;
  submissionRevisionId: string;
  trackId: string;
  technicalStatus: TechnicalStatus;
  aiStatus: AiAnalysisStatus;
  overallStatus: AnalysisOverallStatus;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  technicalResults: FileTechnicalResultDto[];
  issues: QcIssueDto[];
  normalizedAiResult: NormalizedAnalysisResult | null;
  suggestionCount: number;
}
