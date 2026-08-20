import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LibraryCollection } from "./library-collection";

describe("LibraryCollection", () => {
  it("renders the real empty catalog state without fake counts", () => {
    render(<LibraryCollection tracks={[]} />);

    expect(
      screen.getByRole("heading", { name: "No published tracks yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Approved music will appear here once the intake and review workflow is active.",
      ),
    ).toBeInTheDocument();
  });
});
