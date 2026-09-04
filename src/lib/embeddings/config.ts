import "server-only";

export type EmbeddingProviderKind = "gemini" | "simulated";

export interface EmbeddingConfig {
  provider: EmbeddingProviderKind;
  model: string;
  modelVersion: string;
  dimension: number;
  apiKey?: string;
  semanticSearchEnabled: boolean;
  jobLeaseMs: number;
  jobConcurrency: number;
}

export function parseEmbeddingConfig(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingConfig {
  for (const key of Object.keys(env)) {
    if (key.startsWith("NEXT_PUBLIC_") && /GEMINI|EMBEDDING/.test(key)) {
      throw new Error(
        "Embedding credentials must never use NEXT_PUBLIC_ variables",
      );
    }
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  const rawProvider = env.EMBEDDING_PROVIDER?.trim().toLowerCase();

  let provider: EmbeddingProviderKind = "simulated";
  if (rawProvider === "gemini") {
    provider = "gemini";
  } else if (rawProvider === "simulated") {
    provider = "simulated";
  } else if (apiKey) {
    provider = "gemini";
  }

  const model = env.EMBEDDING_MODEL?.trim() || "gemini-embedding-2";
  const modelVersion = env.EMBEDDING_MODEL_VERSION?.trim() || "v1";

  const rawDimension = env.EMBEDDING_DIMENSION?.trim();
  const dimension = rawDimension ? parseInt(rawDimension, 10) : 768;
  if (![128, 256, 512, 768, 1536, 3072].includes(dimension)) {
    throw new Error(
      `Invalid EMBEDDING_DIMENSION "${rawDimension}". Supported dimensions are 128, 256, 512, 768, 1536, 3072.`,
    );
  }

  const semanticSearchEnabled =
    env.SEMANTIC_SEARCH_ENABLED === "true" ||
    env.SEMANTIC_SEARCH_ENABLED === "1";

  const rawLease = env.EMBEDDING_JOB_LEASE_MS?.trim();
  const jobLeaseMs = rawLease ? parseInt(rawLease, 10) : 300_000;

  const rawConcurrency = env.EMBEDDING_JOB_CONCURRENCY?.trim();
  const jobConcurrency = rawConcurrency ? parseInt(rawConcurrency, 10) : 2;

  return {
    provider,
    model,
    modelVersion,
    dimension,
    apiKey,
    semanticSearchEnabled,
    jobLeaseMs,
    jobConcurrency,
  };
}
