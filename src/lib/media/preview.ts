import "server-only";

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createWaveformAccumulator } from "./waveform";
import { probeAudioFile } from "@/lib/audio/ffprobe";
import { runAudioTool } from "@/lib/audio/process";
import type { MediaConfig } from "./config";

export async function createPlaybackPreview(
  sourcePath: string,
  destinationPath: string,
  config: MediaConfig,
) {
  await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  const source = await probeAudioFile(sourcePath, config.packageTimeoutMs);
  const channelArgs =
    source.channels && source.channels > 2 ? ["-ac", "2"] : [];
  await runAudioTool({
    binary: "ffmpeg",
    args: [
      "-nostdin",
      "-hide_banner",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      sourcePath,
      "-map",
      "0:a:0",
      "-vn",
      "-sn",
      "-dn",
      "-map_metadata",
      "-1",
      ...channelArgs,
      "-ar",
      String(config.previewSampleRateHz),
      "-c:a",
      "libmp3lame",
      "-b:a",
      `${config.previewBitrateKbps}k`,
      "-write_xing",
      "1",
      "-y",
      destinationPath,
    ],
    timeoutMs: config.packageTimeoutMs,
  });
  const preview = await probeAudioFile(
    destinationPath,
    config.packageTimeoutMs,
  );
  if (Math.abs(preview.durationMs - source.durationMs) > 250) {
    throw new Error("Generated preview duration differs from its source");
  }
  return { source, preview };
}

export async function extractWaveformPeaks(
  sourcePath: string,
  durationMs: number,
  config: MediaConfig,
  signal?: AbortSignal,
): Promise<number[]> {
  const totalSamples = Math.max(1, Math.ceil((durationMs / 1000) * 8_000));
  const waveform = createWaveformAccumulator(
    totalSamples,
    config.waveformPeakCount,
  );
  const child = spawn(
    "ffmpeg",
    [
      "-nostdin",
      "-hide_banner",
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      sourcePath,
      "-map",
      "0:a:0",
      "-vn",
      "-sn",
      "-dn",
      "-ac",
      "1",
      "-ar",
      "8000",
      "-f",
      "s16le",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"], signal },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-4_000);
  });
  const completed = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  for await (const chunk of child.stdout) waveform.push(chunk as Buffer);
  const exitCode = await completed;
  if (exitCode !== 0)
    throw new Error(stderr.trim() || "Waveform extraction failed");
  return waveform.finish();
}
