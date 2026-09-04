import { describe, expect, it } from "vitest";
import {
  getAvailableGenerationProviders,
  parseGenerationConfig,
} from "./config";

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

  it("shows only local simulation when no live provider key is configured", () => {
    const providers = getAvailableGenerationProviders(
      parseGenerationConfig({} as unknown as NodeJS.ProcessEnv),
    );

    expect(providers.map((item) => item.provider)).toEqual(["simulated"]);
    expect(providers[0]?.assetKinds).toEqual(["music", "sound_effect"]);
  });

  it("shows configured live providers and keeps dry-run simulation available", () => {
    const providers = getAvailableGenerationProviders(
      parseGenerationConfig({
        GEMINI_API_KEY: "gemini-key",
        ELEVENLABS_API_KEY: "elevenlabs-key",
      } as unknown as NodeJS.ProcessEnv),
    );

    expect(providers.map((item) => item.provider)).toEqual([
      "google_lyria",
      "elevenlabs",
      "simulated",
    ]);
    expect(
      providers.find((item) => item.provider === "google_lyria")?.assetKinds,
    ).toEqual(["music"]);
    expect(
      providers.find((item) => item.provider === "elevenlabs")?.assetKinds,
    ).toEqual(["music", "sound_effect"]);
  });
});
