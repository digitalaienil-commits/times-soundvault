import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { calculateFileSha256 } from "@/lib/audio/checksum";
import { runAudioTool } from "@/lib/audio/process";

import { createCopyrightTestVideo } from "./ffmpeg";

describe("copyright FFmpeg package", () => {
  it("creates a decodable two-Track MP4 with a silence gap without changing sources", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "soundvault-copyright-"),
    );
    const first = path.join(directory, "first.wav");
    const second = path.join(directory, "second.wav");
    const output = path.join(directory, "test.mp4");
    try {
      for (const [destination, frequency] of [
        [first, "440"],
        [second, "660"],
      ] as const) {
        await runAudioTool({
          binary: "ffmpeg",
          args: [
            "-nostdin",
            "-f",
            "lavfi",
            "-i",
            `sine=frequency=${frequency}:duration=1`,
            "-c:a",
            "pcm_s16le",
            "-y",
            destination,
          ],
          timeoutMs: 20_000,
        });
      }
      const before = await Promise.all([
        calculateFileSha256(first),
        calculateFileSha256(second),
      ]);
      await createCopyrightTestVideo({
        sourcePaths: [first, second],
        destinationPath: output,
        gapSeconds: 2,
        totalDurationMs: 4_000,
        timeoutMs: 30_000,
      });
      const probe = await runAudioTool({
        binary: "ffprobe",
        args: [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=nokey=1:noprint_wrappers=1",
          output,
        ],
        timeoutMs: 10_000,
      });
      expect(Number(probe.stdout.trim())).toBeGreaterThanOrEqual(3.9);
      expect(Number(probe.stdout.trim())).toBeLessThan(4.2);
      expect(
        await Promise.all([
          calculateFileSha256(first),
          calculateFileSha256(second),
        ]),
      ).toEqual(before);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
