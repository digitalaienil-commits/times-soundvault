import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLockup } from "./brand-lockup";

describe("BrandLockup", () => {
  it("renders the approved brand mark and Times SoundVault product name", async () => {
    render(await BrandLockup({}));

    expect(
      screen.getByRole("img", { name: "The Times Group" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Times SoundVault")).toBeInTheDocument();
  });

  it("keeps the product name available to assistive technology when compact", async () => {
    render(await BrandLockup({ compact: true }));

    expect(screen.getByText("Times SoundVault")).toHaveClass("sr-only");
  });
});
