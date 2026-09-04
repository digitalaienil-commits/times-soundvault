import "server-only";

import { GoogleGenAI } from "@google/genai";
import { type EmbeddingProvider, EmbeddingProviderError } from "./provider";

export class GoogleEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "gemini";
  readonly model: string;
  readonly modelVersion: string;
  readonly dimension: number;
  private readonly client: GoogleGenAI;

  constructor(options: {
    apiKey: string;
    model?: string;
    modelVersion?: string;
    dimension?: number;
  }) {
    if (!options.apiKey?.trim()) {
      throw new EmbeddingProviderError(
        "CONFIG_ERROR",
        "GEMINI_API_KEY is required to initialize GoogleEmbeddingProvider",
      );
    }
    this.model = options.model ?? "gemini-embedding-2";
    this.modelVersion = options.modelVersion ?? "1.0.0";
    this.dimension = options.dimension ?? 768;
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
  }

  async embedDocument(text: string): Promise<number[]> {
    return this.embedWithTask(text, "RETRIEVAL_DOCUMENT");
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embedWithTask(text, "RETRIEVAL_QUERY");
  }

  private async embedWithTask(
    text: string,
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  ): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new EmbeddingProviderError(
        "PROVIDER_FAILURE",
        "Cannot generate embedding for empty text content",
      );
    }

    try {
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: trimmed,
        config: {
          taskType,
          outputDimensionality: this.dimension,
        },
      });

      const values =
        response.embeddings?.[0]?.values ??
        (response as unknown as { embedding?: { values?: number[] } }).embedding
          ?.values;

      if (!values || !Array.isArray(values) || values.length === 0) {
        throw new EmbeddingProviderError(
          "PROVIDER_FAILURE",
          `Google GenAI embedding response returned no vector values for model ${this.model}`,
        );
      }

      if (values.length !== this.dimension) {
        throw new EmbeddingProviderError(
          "DIMENSION_MISMATCH",
          `Embedding dimension mismatch: expected ${this.dimension}, received ${values.length}`,
        );
      }

      return values;
    } catch (error) {
      if (error instanceof EmbeddingProviderError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("429") ||
        message.toLowerCase().includes("quota") ||
        message.toLowerCase().includes("rate limit")
      ) {
        throw new EmbeddingProviderError(
          "RATE_LIMITED",
          `Google GenAI embedding rate limit or quota exceeded: ${message}`,
        );
      }
      throw new EmbeddingProviderError(
        "PROVIDER_FAILURE",
        `Google GenAI embedding failed: ${message}`,
      );
    }
  }
}
