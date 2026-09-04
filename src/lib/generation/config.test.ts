import { describe, expect, it } from "vitest";
import { parseGenerationConfig } from "./config";

describe("parseGenerationConfig", () => {
  it("defaults to dryRun = true for local safety", () => {
    const config = parseGenerationConfig({} as unknown as NodeJS.ProcessEnv);
    expect(config.dryRun).toBe(true);
    expect(config.provider).toBe("google_lyria");
  });

  it("respects GENERATION_DRY_RUN=false only when explicitly configured", () => {
    const config = parseGenerationConfig({
      GENERATION_DRY_RUN: "false",
      GENERATION_PROVIDER: "elevenlabs",
    } as unknown as NodeJS.ProcessEnv);
    expect(config.dryRun).toBe(false);
    expect(config.provider).toBe("elevenlabs");
  });

  it("rejects NEXT_PUBLIC variables for generation credentials", () => {
    expect(() =>
      parseGenerationConfig({
        NEXT_PUBLIC_ELEVENLABS_API_KEY: "secret",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/NEXT_PUBLIC_/);
  });
});
