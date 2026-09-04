import { describe, expect, it } from "vitest";
import { parseProcessingConfig } from "./config";

describe("processing configuration", () => {
  it("rejects a public temporary directory", () => {
    expect(() =>
      parseProcessingConfig({ PROCESSING_TEMP_ROOT: "public/processing" }),
    ).toThrow(/public/);
  });
  it("rejects browser-exposed processing variables", () => {
    expect(() =>
      parseProcessingConfig({ NEXT_PUBLIC_PROCESSING_TOKEN: "secret" }),
    ).toThrow(/never/);
  });
});
