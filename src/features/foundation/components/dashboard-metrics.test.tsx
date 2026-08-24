import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardMetrics } from "./dashboard-metrics";

const metrics = {
  totalTracks: 247,
  averageAiConfidence: 0.84,
  attentionCount: 12,
  totalDurationMs: 138_600_000,
  publishedTracks: 204,
};

describe("DashboardMetrics", () => {
  it("shows the review workload to Coordinators without prohibited concepts", () => {
    render(<DashboardMetrics metrics={metrics} role="coordinator" />);

    expect(screen.getAllByTestId("dashboard-metric")).toHaveLength(5);
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(screen.getByText("84%")).toBeInTheDocument();
    expect(screen.getByText("38.5h")).toBeInTheDocument();
    expect(screen.queryByText(/channels/i)).not.toBeInTheDocument();
  });

  it("shows owner-scoped submission language to Music Producers", () => {
    render(<DashboardMetrics metrics={metrics} role="music_producer" />);

    expect(screen.getByText("My Submissions")).toBeInTheDocument();
    expect(screen.getByText("Across your submissions")).toBeInTheDocument();
    expect(screen.queryByText("Needs Review")).not.toBeInTheDocument();
  });
});
