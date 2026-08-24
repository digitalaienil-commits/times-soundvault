import { describe, expect, it } from "vitest";

import {
  canMutateUploadSubmission,
  canReadUploadSubmission,
} from "./authorization";

describe("upload object authorization", () => {
  it("allows Admin to read and mutate any draft", () => {
    expect(
      canReadUploadSubmission({ id: "admin", role: "admin" }, "owner"),
    ).toBe(true);
    expect(
      canMutateUploadSubmission({ id: "admin", role: "admin" }, "owner"),
    ).toBe(true);
  });
  it("allows Producer and Coordinator to mutate only owned drafts", () => {
    expect(
      canMutateUploadSubmission(
        { id: "owner", role: "music_producer" },
        "owner",
      ),
    ).toBe(true);
    expect(
      canMutateUploadSubmission(
        { id: "other", role: "music_producer" },
        "owner",
      ),
    ).toBe(false);
    expect(
      canMutateUploadSubmission({ id: "owner", role: "coordinator" }, "owner"),
    ).toBe(true);
    expect(
      canMutateUploadSubmission({ id: "other", role: "coordinator" }, "owner"),
    ).toBe(false);
    expect(
      canReadUploadSubmission({ id: "other", role: "coordinator" }, "owner"),
    ).toBe(true);
  });
  it("denies Library users", () => {
    expect(canReadUploadSubmission({ id: "user", role: "user" }, "owner")).toBe(
      false,
    );
    expect(
      canMutateUploadSubmission({ id: "user", role: "user" }, "owner"),
    ).toBe(false);
  });
});
