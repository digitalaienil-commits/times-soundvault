import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLockup } from "./brand-lockup";

describe("BrandLockup", () => {
  it("renders the Times SoundVault product name", async () => {
    render(await BrandLockup({}));

    expect(screen.getByText("Times SoundVault")).toBeInTheDocument();
  });
});
