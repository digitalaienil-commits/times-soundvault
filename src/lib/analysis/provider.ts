import "server-only";

import type { NormalizedAnalysisResult } from "@/types/processing";

export interface ProviderHealth {
  ok: boolean;
  message: string;
}

export interface ProviderAnalysisReference {
  provider: "cyanite";
  providerVersion: "v7";
  providerTrackId: string;
  externalId: string;
  reused: boolean;
}

export interface ProviderAnalysisResult {
  status: "processing" | "finished" | "failed";
  providerTrackId: string;
  rawResult?: Record<string, unknown>;
  normalizedResult?: NormalizedAnalysisResult;
  errorMessage?: string;
}

export interface MusicAnalysisProvider {
  readonly kind: "cyanite";
  readonly version: "v7";
  verifyConnection(): Promise<ProviderHealth>;
  createAnalysis(input: {
    filePath: string;
    externalId: string;
    title: string;
  }): Promise<ProviderAnalysisReference>;
  getAnalysis(
    reference: ProviderAnalysisReference,
  ): Promise<ProviderAnalysisResult>;
}

export class AnalysisProviderError extends Error {
  constructor(
    public readonly code:
      | "PROVIDER_AUTH"
      | "PROVIDER_RATE_LIMIT"
      | "PROVIDER_TIMEOUT"
      | "PROVIDER_RESPONSE"
      | "PROVIDER_UNAVAILABLE",
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AnalysisProviderError";
  }
}
