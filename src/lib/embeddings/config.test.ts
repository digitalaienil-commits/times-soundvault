import { describe, expect, it } from "vitest";
import { parseEmbeddingConfig } from "./config";

describe("parseEmbeddingConfig", () => {
  it("defaults to semanticSearchEnabled = false for privacy and simulated fallback without key", () => {
    const config = parseEmbeddingConfig({} as unknown as NodeJS.ProcessEnv);
    expect(config.semanticSearchEnabled).toBe(false);
    expect(config.provider).toBe("simulated");
    expect(config.model).toBe("gemini-embedding-2");
    expect(config.dimension).toBe(768);
  });

  it("selects gemini when GEMINI_API_KEY is provided", () => {
    const config = parseEmbeddingConfig({
      GEMINI_API_KEY: "test-api-key",
    } as unknown as NodeJS.ProcessEnv);
    expect(config.provider).toBe("gemini");
  });

  it("enables semantic search only when SEMANTIC_SEARCH_ENABLED=true", () => {
    const config = parseEmbeddingConfig({
      SEMANTIC_SEARCH_ENABLED: "true",
      EMBEDDING_PROVIDER: "simulated",
      EMBEDDING_DIMENSION: "512",
    } as unknown as NodeJS.ProcessEnv);
    expect(config.semanticSearchEnabled).toBe(true);
    expect(config.provider).toBe("simulated");
    expect(config.dimension).toBe(512);
  });
});
