import { describe, expect, it } from "vitest";
import { SimulatedEmbeddingProvider } from "./provider";

describe("SimulatedEmbeddingProvider", () => {
  it("generates deterministic normalized 768-d unit vectors", async () => {
    const provider = new SimulatedEmbeddingProvider({ dimension: 768 });
    const vector1 = await provider.embedDocument("Morning raga with sitar");
    const vector2 = await provider.embedDocument("Morning raga with sitar");

    expect(vector1).toHaveLength(768);
    expect(vector2).toHaveLength(768);
    expect(vector1).toEqual(vector2);

    // Magnitude should be ~1.0 (unit vector)
    const norm = Math.sqrt(vector1.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it("produces different vectors for distinct text", async () => {
    const provider = new SimulatedEmbeddingProvider({ dimension: 768 });
    const v1 = await provider.embedDocument("dark cinematic suspense");
    const v2 = await provider.embedDocument("upbeat Diwali celebration");

    expect(v1).not.toEqual(v2);

    // Cosine similarity should be strictly less than 1.0
    const dot = v1.reduce((sum, v, i) => sum + v * v2[i]!, 0);
    expect(dot).toBeLessThan(0.9);
  });

  it("embedQuery behaves consistently with embedDocument", async () => {
    const provider = new SimulatedEmbeddingProvider({ dimension: 768 });
    const queryVec = await provider.embedQuery("breaking news theme");
    expect(queryVec).toHaveLength(768);
  });
});
