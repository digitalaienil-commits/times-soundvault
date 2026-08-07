import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SidebarNavigation } from "./sidebar-navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/library",
}));

describe("SidebarNavigation", () => {
  it("marks the active destination with the current-page semantic state", () => {
    render(<SidebarNavigation role="admin" />);

    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
