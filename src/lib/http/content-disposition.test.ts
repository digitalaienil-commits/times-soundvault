import { describe, expect, it } from "vitest";
import {
  contentDisposition,
  safeDownloadFilename,
} from "./content-disposition";

describe("download filenames", () => {
  it("strips paths, controls, and reserved names", () => {
    expect(safeDownloadFilename("../../CON\u0000.wav")).toBe("_CON_.wav");
  });
  it("provides ASCII and UTF-8 parameters", () => {
    expect(contentDisposition("attachment", "संगीत master.wav")).toContain(
      "filename*=UTF-8''",
    );
  });
});
