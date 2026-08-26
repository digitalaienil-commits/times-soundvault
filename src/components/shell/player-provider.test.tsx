import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlayerProvider, useSoundVaultPlayer } from "./player-provider";

function Harness() {
  const player = useSoundVaultPlayer();
  return (
    <button
      onClick={() =>
        void player.playTrack("track-one", [
          {
            trackId: "track-one",
            title: "News Theme",
            versionLabel: "Main",
            durationMs: 1_000,
          },
        ])
      }
    >
      Start
    </button>
  );
}

describe("workspace player", () => {
  const play = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          trackId: "track-one",
          title: "News Theme",
          versionLabel: "Main",
          status: "ready",
          masterPlaybackReady: true,
          sources: [
            {
              audioAssetId: "asset-one",
              kind: "master",
              label: "Master",
              durationMs: 1_000,
              sourceFormat: "wav",
              sourceByteSize: 96_000,
              ready: true,
              streamUrl: "/preview",
              downloadUrl: "/download",
              waveformPeaks: [-20, 30, -40, 50],
            },
          ],
        }),
      }),
    );
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("does not autoplay and exposes labelled keyboard controls after a user starts playback", async () => {
    render(
      <PlayerProvider>
        <Harness />
      </PlayerProvider>,
    );
    expect(play).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(
      await screen.findByRole("region", { name: "SoundVault player" }),
    ).toBeVisible();
    expect(screen.getByText("News Theme · Master")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Play News Theme" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Next track" })).toBeVisible();
    expect(
      screen.getByRole("slider", { name: /Seek through News Theme/ }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Mute" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "Volume" })).toBeInTheDocument();
    expect(play).toHaveBeenCalledTimes(1);
  });
});
