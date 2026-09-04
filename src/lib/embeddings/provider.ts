import { createHash } from "node:crypto";

export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly modelVersion: string;
  readonly dimension: number;

  embedDocument(text: string): Promise<number[]>;
  embedQuery(text: string): Promise<number[]>;
}

export class EmbeddingProviderError extends Error {
  constructor(
    public readonly code:
      | "CONFIG_ERROR"
      | "RATE_LIMITED"
      | "DIMENSION_MISMATCH"
      | "PROVIDER_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "EmbeddingProviderError";
  }
}

/**
 * Deterministic pseudo-random embedding generator for offline development,
 * local testing, and dry-run operation without external provider costs.
 */
export class SimulatedEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "simulated";
  readonly model: string;
  readonly modelVersion: string;
  readonly dimension: number;

  constructor(
    options: {
      model?: string;
      modelVersion?: string;
      dimension?: number;
    } = {},
  ) {
    this.model = options.model ?? "simulated-v1";
    this.modelVersion = options.modelVersion ?? "1.0.0";
    this.dimension = options.dimension ?? 768;
  }

  async embedDocument(text: string): Promise<number[]> {
    return this.generateDeterministicVector(`doc:${text.trim().toLowerCase()}`);
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.generateDeterministicVector(
      `query:${text.trim().toLowerCase()}`,
    );
  }

  private generateDeterministicVector(seedText: string): number[] {
    const vector = new Array<number>(this.dimension);
    let hash = createHash("sha256").update(seedText).digest();
    let normSq = 0;

    for (let i = 0; i < this.dimension; i++) {
      if (i % 32 === 0 && i > 0) {
        hash = createHash("sha256").update(hash).digest();
      }
      const byte = hash[i % 32]!;
      // Center around 0 in range [-1, 1]
      const val = (byte - 128) / 128;
      vector[i] = val;
      normSq += val * val;
    }

    // Normalize to unit vector (L2 norm = 1) for cosine distance compatibility
    const norm = Math.sqrt(normSq) || 1;
    for (let i = 0; i < this.dimension; i++) {
      vector[i] = Number((vector[i]! / norm).toFixed(6));
    }

    return vector;
  }
}
