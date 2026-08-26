import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { calculateFileSha256 } from "@/lib/audio/checksum";
import { probeAudioFile } from "@/lib/audio/ffprobe";
import { runAudioTool } from "@/lib/audio/process";
import { parseMediaConfig } from "./config";
import { createPlaybackPreview, extractWaveformPeaks } from "./preview";

describe("Section 10 FFmpeg preview profile", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("preserves mono/stereo, downmixes multichannel, strips metadata and streams peaks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundvault-preview-"));
    roots.push(root);
    const config = parseMediaConfig({ MEDIA_TEMP_ROOT: root });
    const cases = [
      { name: "mono.wav", layout: "mono", expectedChannels: 1 },
      { name: "stereo.wav", layout: "stereo", expectedChannels: 2 },
      { name: "surround.wav", layout: "5.1", expectedChannels: 2 },
      { name: "source.mp3", layout: "mono", expectedChannels: 1 },
    ];
    for (const item of cases) {
      const source = path.join(root, item.name);
      const preview = path.join(root, `${item.name}.preview.mp3`);
      await runAudioTool({
        binary: "ffmpeg",
        args: [
          "-nostdin",
          "-hide_banner",
          "-f",
          "lavfi",
          "-i",
          `anullsrc=r=48000:cl=${item.layout}`,
          "-t",
          "0.5",
          "-metadata",
          "title=must-not-survive",
          ...(item.name.endsWith(".mp3")
            ? ["-c:a", "libmp3lame", "-b:a", "128k"]
            : ["-c:a", "pcm_s16le"]),
          "-y",
          source,
        ],
        timeoutMs: 30_000,
      });
      const before = await calculateFileSha256(source);
      await createPlaybackPreview(source, preview, config);
      const probed = await probeAudioFile(preview, 30_000);
      expect(probed.channels, item.name).toBe(item.expectedChannels);
      expect(probed.sampleRateHz, item.name).toBe(48_000);
      expect(probed.embeddedTags, item.name).toEqual({});
      expect(await calculateFileSha256(source), item.name).toBe(before);
      const peaks = await extractWaveformPeaks(
        source,
        probed.durationMs,
        config,
      );
      expect(peaks, item.name).toHaveLength(4_096);
    }
  }, 60_000);
});
