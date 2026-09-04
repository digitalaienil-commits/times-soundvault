import "server-only";

import { parseEmbeddingConfig } from "./config";
import { GoogleEmbeddingProvider } from "./google-provider";
import { type EmbeddingProvider, SimulatedEmbeddingProvider } from "./provider";

let cachedProvider: EmbeddingProvider | null = null;

export function createEmbeddingProvider(): EmbeddingProvider {
  const config = parseEmbeddingConfig();

  if (config.provider === "gemini" && config.apiKey) {
    return new GoogleEmbeddingProvider({
      apiKey: config.apiKey,
      model: config.model,
      modelVersion: config.modelVersion,
      dimension: config.dimension,
    });
  }

  return new SimulatedEmbeddingProvider({
    model: config.model,
    modelVersion: config.modelVersion,
    dimension: config.dimension,
  });
}

export function getSharedEmbeddingProvider(): EmbeddingProvider {
  if (!cachedProvider) {
    cachedProvider = createEmbeddingProvider();
  }
  return cachedProvider;
}
