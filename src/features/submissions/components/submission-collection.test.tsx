import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SubmissionCollection } from "./submission-collection";

describe("SubmissionCollection", () => {
  it("renders the owned-submission empty state", () => {
    render(<SubmissionCollection submissions={[]} kind="owned" />);
    expect(
      screen.getByRole("heading", { name: "No submissions yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your uploaded tracks will appear here when the upload workspace is available.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the review queue empty state", () => {
    render(<SubmissionCollection submissions={[]} kind="review" />);
    expect(
      screen.getByRole("heading", { name: "Nothing waiting for review" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Submissions ready for Coordinator review will appear here.",
      ),
    ).toBeInTheDocument();
  });
});
