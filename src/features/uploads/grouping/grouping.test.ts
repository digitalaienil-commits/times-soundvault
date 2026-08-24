import { describe, expect, it } from "vitest";

import {
  humanizeWorkingTitle,
  isInstrumentalFullMix,
  safeFilenameBase,
  suggestFileAssignment,
} from "./grouping";

const file = (name: string) => ({
  clientId: name,
  name,
  size: 100,
  type: "audio/wav",
});

describe("upload filename grouping suggestions", () => {
  it("detects master and common Stem suffixes without making ambiguous guesses", () => {
    expect(
      suggestFileAssignment(file("Election_Theme_MASTER.wav")),
    ).toMatchObject({
      groupKey: "election-theme",
      suggestedRole: "master",
    });
    expect(
      suggestFileAssignment(file("Election_Theme_DRUMS.wav")),
    ).toMatchObject({
      groupKey: "election-theme",
      suggestedRole: "stem",
      suggestedStemType: "drums",
    });
    expect(suggestFileAssignment(file("mystery.wav"))).toMatchObject({
      groupKey: null,
      suggestedRole: "unassigned",
    });
  });

  it("derives a human title and strips path-like filename characters", () => {
    expect(humanizeWorkingTitle("election_theme_MASTER.wav")).toBe(
      "Election Theme",
    );
    expect(safeFilenameBase("../unsafe\\name.wav")).not.toMatch(/[\\/]/);
  });

  it("never classifies an instrumental full mix as a Stem", () => {
    expect(isInstrumentalFullMix("Theme_Instrumental_Mix.wav")).toBe(true);
    expect(
      suggestFileAssignment(file("Theme_Instrumental_Mix.wav")),
    ).toMatchObject({
      suggestedRole: "master",
    });
  });
});
