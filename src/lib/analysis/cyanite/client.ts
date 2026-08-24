import "server-only";

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import type {
  MusicAnalysisProvider,
  ProviderAnalysisReference,
  ProviderAnalysisResult,
  ProviderHealth,
} from "../provider";
import { AnalysisProviderError } from "../provider";
import type { CyaniteConfig } from "./config";
import { boundCyaniteRawResult, normalizeCyaniteV7Result } from "./mapper";
import {
  FILE_UPLOAD_REQUEST_MUTATION,
  FIND_BY_EXTERNAL_ID_QUERY,
  LIBRARY_TRACK_CREATE_MUTATION,
  LIBRARY_TRACK_V7_QUERY,
  VERIFY_CONNECTION_QUERY,
} from "./queries";

type JsonObject = Record<string, unknown>;

export class CyaniteClient implements MusicAnalysisProvider {
  readonly kind = "cyanite" as const;
  readonly version = "v7" as const;

  constructor(private readonly config: CyaniteConfig) {
    if (!config.enabled || !config.accessToken) {
      throw new AnalysisProviderError(
        "PROVIDER_AUTH",
        "Cyanite is not configured",
        false,
      );
    }
  }

  private async graphql(
    query: string,
    variables: JsonObject = {},
  ): Promise<JsonObject> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs,
    );
    try {
      const response = await fetch(this.config.apiUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      const retryAfter =
        Number(response.headers.get("retry-after") ?? 0) * 1_000;
      if (response.status === 401 || response.status === 403)
        throw new AnalysisProviderError(
          "PROVIDER_AUTH",
          "Cyanite rejected the server credential",
          false,
        );
      if (response.status === 429)
        throw new AnalysisProviderError(
          "PROVIDER_RATE_LIMIT",
          "Cyanite rate limit reached",
          true,
          retryAfter || undefined,
        );
      if (!response.ok)
        throw new AnalysisProviderError(
          "PROVIDER_UNAVAILABLE",
          `Cyanite returned HTTP ${response.status}`,
          response.status >= 500,
        );
      const payload = (await response.json()) as {
        data?: JsonObject;
        errors?: Array<{ message?: string }>;
      };
      if (payload.errors?.length)
        throw new AnalysisProviderError(
          "PROVIDER_RESPONSE",
          payload.errors[0]?.message?.slice(0, 300) ||
            "Cyanite GraphQL request failed",
          false,
        );
      if (!payload.data)
        throw new AnalysisProviderError(
          "PROVIDER_RESPONSE",
          "Cyanite response did not contain data",
          false,
        );
      return payload.data;
    } catch (error) {
      if (error instanceof AnalysisProviderError) throw error;
      if ((error as Error).name === "AbortError")
        throw new AnalysisProviderError(
          "PROVIDER_TIMEOUT",
          "Cyanite request timed out",
          true,
        );
      throw new AnalysisProviderError(
        "PROVIDER_UNAVAILABLE",
        "Cyanite request could not be completed",
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async verifyConnection(): Promise<ProviderHealth> {
    await this.graphql(VERIFY_CONNECTION_QUERY);
    return { ok: true, message: "Cyanite GraphQL connection verified" };
  }

  async createAnalysis(input: {
    filePath: string;
    externalId: string;
    title: string;
  }): Promise<ProviderAnalysisReference> {
    const existing = await this.graphql(FIND_BY_EXTERNAL_ID_QUERY, {
      externalId: input.externalId,
    });
    const edges = ((existing.libraryTracks as JsonObject | undefined)?.edges ??
      []) as Array<{ node?: { id?: string; externalId?: string } }>;
    const exact = edges.find(
      (edge) => edge.node?.externalId === input.externalId,
    )?.node;
    if (exact?.id)
      return {
        provider: "cyanite",
        providerVersion: "v7",
        providerTrackId: exact.id,
        externalId: input.externalId,
        reused: true,
      };

    const upload = await this.graphql(FILE_UPLOAD_REQUEST_MUTATION);
    const request = upload.fileUploadRequest as
      { id?: string; uploadUrl?: string } | undefined;
    if (!request?.id || !request.uploadUrl)
      throw new AnalysisProviderError(
        "PROVIDER_RESPONSE",
        "Cyanite did not provide an upload URL",
        false,
      );
    const file = await stat(input.filePath);
    const response = await fetch(request.uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": "audio/mpeg",
        "content-length": String(file.size),
      },
      body: Readable.toWeb(
        createReadStream(input.filePath),
      ) as ReadableStream<Uint8Array>,
      duplex: "half",
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    } as RequestInit & { duplex: "half" });
    if (!response.ok)
      throw new AnalysisProviderError(
        "PROVIDER_UNAVAILABLE",
        `Cyanite upload returned HTTP ${response.status}`,
        response.status >= 500 || response.status === 429,
      );

    const created = await this.graphql(LIBRARY_TRACK_CREATE_MUTATION, {
      input: {
        uploadId: request.id,
        title: input.title.slice(0, 300),
        externalId: input.externalId,
      },
    });
    const union = created.libraryTrackCreate as JsonObject | undefined;
    const track = union?.createdLibraryTrack as { id?: string } | undefined;
    if (!track?.id)
      throw new AnalysisProviderError(
        "PROVIDER_RESPONSE",
        String(
          union?.message ?? "Cyanite could not create the Library Track",
        ).slice(0, 300),
        false,
      );
    return {
      provider: "cyanite",
      providerVersion: "v7",
      providerTrackId: track.id,
      externalId: input.externalId,
      reused: false,
    };
  }

  async getAnalysis(
    reference: ProviderAnalysisReference,
  ): Promise<ProviderAnalysisResult> {
    const response = await this.graphql(LIBRARY_TRACK_V7_QUERY, {
      id: reference.providerTrackId,
    });
    const track = response.libraryTrack as JsonObject | undefined;
    if (track?.__typename !== "LibraryTrack")
      throw new AnalysisProviderError(
        "PROVIDER_RESPONSE",
        String(track?.message ?? "Cyanite Library Track was not found"),
        false,
      );
    const analysis = track.audioAnalysisV7 as JsonObject | null | undefined;
    if (
      !analysis ||
      !analysis.__typename ||
      analysis.__typename === "AudioAnalysisV7Processing"
    )
      return {
        status: "processing",
        providerTrackId: reference.providerTrackId,
      };
    if (analysis.__typename === "AudioAnalysisV7Failed") {
      const failure = analysis.error as JsonObject | undefined;
      return {
        status: "failed",
        providerTrackId: reference.providerTrackId,
        errorMessage: String(
          failure?.message ?? "Cyanite analysis failed",
        ).slice(0, 500),
      };
    }
    const raw = boundCyaniteRawResult((analysis.result ?? {}) as JsonObject);
    return {
      status: "finished",
      providerTrackId: reference.providerTrackId,
      rawResult: raw,
      normalizedResult: normalizeCyaniteV7Result(raw),
    };
  }
}
