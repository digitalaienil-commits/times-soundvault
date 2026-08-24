import "server-only";

import { runAudioTool } from "./process";

export interface AudioMeasurements {
  integratedLoudnessLufs: number | null;
  loudnessRangeLu: number | null;
  truePeakDbtp: number | null;
  samplePeakDbfs: number | null;
  leadingSilenceMs: number | null;
  trailingSilenceMs: number | null;
}

function lastNumber(text: string, pattern: RegExp): number | null {
  const matches = [...text.matchAll(pattern)];
  const value = Number(matches.at(-1)?.[1]);
  return Number.isFinite(value) ? value : null;
}

export function parseFfmpegMeasurements(
  stderr: string,
  durationMs: number,
): AudioMeasurements {
  const silenceStarts = [
    ...stderr.matchAll(/silence_start:\s*(-?[\d.]+)/g),
  ].map((match) => Number(match[1]));
  const silenceEnds = [...stderr.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map(
    (match) => Number(match[1]),
  );
  let leadingSilenceMs: number | null = null;
  if ((silenceStarts[0] ?? 1) <= 0.05 && silenceEnds[0] != null) {
    leadingSilenceMs = Math.max(0, Math.round(silenceEnds[0] * 1000));
  }
  let trailingSilenceMs: number | null = null;
  const finalStart = silenceStarts.at(-1);
  const finalEnd = silenceEnds.at(-1);
  const durationSeconds = durationMs / 1000;
  if (
    finalStart != null &&
    (finalEnd == null || finalEnd >= durationSeconds - 0.1)
  ) {
    trailingSilenceMs = Math.max(
      0,
      Math.round((durationSeconds - finalStart) * 1000),
    );
  }
  return {
    integratedLoudnessLufs: lastNumber(stderr, /^\s*I:\s*(-?[\d.]+)\s*LUFS/gm),
    loudnessRangeLu: lastNumber(stderr, /^\s*LRA:\s*(-?[\d.]+)\s*LU/gm),
    truePeakDbtp: lastNumber(stderr, /^\s*Peak:\s*(-?[\d.]+)\s*dBFS/gm),
    samplePeakDbfs: lastNumber(stderr, /max_volume:\s*(-?[\d.]+)\s*dB/g),
    leadingSilenceMs,
    trailingSilenceMs,
  };
}

export async function measureAudioFile(
  filePath: string,
  durationMs: number,
  timeoutMs: number,
): Promise<AudioMeasurements> {
  const result = await runAudioTool({
    binary: "ffmpeg",
    args: [
      "-nostdin",
      "-hide_banner",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      filePath,
      "-map",
      "0:a:0",
      "-vn",
      "-sn",
      "-dn",
      "-af",
      "ebur128=peak=true,silencedetect=noise=-50dB:d=0.5,volumedetect",
      "-f",
      "null",
      "-",
    ],
    timeoutMs,
  });
  return parseFfmpegMeasurements(result.stderr, durationMs);
}

export async function createCyaniteMp3Derivative(
  sourcePath: string,
  destinationPath: string,
  timeoutMs: number,
): Promise<void> {
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
      "-c:a",
      "libmp3lame",
      "-b:a",
      "320k",
      "-y",
      destinationPath,
    ],
    timeoutMs,
  });
}
