import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { calculateFileSha256 } from "./checksum";
import { createCyaniteMp3Derivative, measureAudioFile } from "./ffmpeg";
import { probeAudioFile } from "./ffprobe";
import { runAudioTool } from "./process";

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("real FFmpeg processing", () => {
  it("probes and measures WAV and MP3 without changing the source", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "soundvault-audio-test-"));
    const wav = path.join(directory, "fixture.wav");
    const mp3 = path.join(directory, "fixture.mp3");
    await runAudioTool({
      binary: "ffmpeg",
      args: [
        "-nostdin",
        "-hide_banner",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-c:a",
        "pcm_s24le",
        wav,
      ],
      timeoutMs: 20_000,
    });
    const before = await calculateFileSha256(wav);
    const wavProbe = await probeAudioFile(wav, 20_000);
    const measurement = await measureAudioFile(
      wav,
      wavProbe.durationMs,
      20_000,
    );
    await createCyaniteMp3Derivative(wav, mp3, 20_000);
    const mp3Probe = await probeAudioFile(mp3, 20_000);
    expect(wavProbe.containerFormat).toContain("wav");
    expect(wavProbe.bitDepth).toBe(24);
    expect(wavProbe.durationMs).toBeGreaterThanOrEqual(990);
    expect(measurement.integratedLoudnessLufs).not.toBeNull();
    expect(mp3Probe.codec).toBe("mp3");
    expect(await calculateFileSha256(wav)).toBe(before);
  });
});
