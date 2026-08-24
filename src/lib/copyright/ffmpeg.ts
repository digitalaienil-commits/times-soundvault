import "server-only";

import { runAudioTool } from "@/lib/audio/process";

export async function createCopyrightTestVideo(input: {
  sourcePaths: readonly string[];
  destinationPath: string;
  gapSeconds: number;
  totalDurationMs: number;
  timeoutMs: number;
}): Promise<void> {
  if (!input.sourcePaths.length)
    throw new Error("A test video needs source audio");
  const args: string[] = ["-nostdin", "-hide_banner"];
  for (const sourcePath of input.sourcePaths) {
    args.push("-protocol_whitelist", "file,pipe", "-i", sourcePath);
  }
  args.push(
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=640x360:r=1:d=${(input.totalDurationMs / 1000).toFixed(3)}`,
  );
  const filters: string[] = [];
  const audioSegments: string[] = [];
  for (let index = 0; index < input.sourcePaths.length; index += 1) {
    filters.push(
      `[${index}:a:0]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${index}]`,
    );
    audioSegments.push(`[a${index}]`);
    if (index < input.sourcePaths.length - 1 && input.gapSeconds > 0) {
      filters.push(
        `anullsrc=r=48000:cl=stereo:d=${input.gapSeconds}[gap${index}]`,
      );
      audioSegments.push(`[gap${index}]`);
    }
  }
  filters.push(
    `${audioSegments.join("")}concat=n=${audioSegments.length}:v=0:a=1[outa]`,
  );
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    `${input.sourcePaths.length}:v:0`,
    "-map",
    "[outa]",
    "-t",
    (input.totalDurationMs / 1000).toFixed(3),
    "-map_metadata",
    "-1",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "stillimage",
    "-b:v",
    "180k",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "320k",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    "-y",
    input.destinationPath,
  );
  await runAudioTool({ binary: "ffmpeg", args, timeoutMs: input.timeoutMs });
}
