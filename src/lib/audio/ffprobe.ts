import "server-only";

import { AudioToolError, runAudioTool } from "./process";

const ALLOWED_TAGS = new Set([
  "title",
  "artist",
  "album",
  "composer",
  "publisher",
  "copyright",
  "genre",
  "date",
  "year",
  "comment",
  "isrc",
]);

interface ProbeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  sample_rate?: string;
  bits_per_sample?: number;
  bits_per_raw_sample?: string;
  channels?: number;
  channel_layout?: string;
  bit_rate?: string;
  duration?: string;
  disposition?: { default?: number };
  tags?: Record<string, unknown>;
}

interface ProbePayload {
  streams?: ProbeStream[];
  format?: {
    format_name?: string;
    duration?: string;
    bit_rate?: string;
    tags?: Record<string, unknown>;
  };
}

export interface ProbedAudio {
  durationMs: number;
  containerFormat: string;
  codec: string;
  bitRateBps: number | null;
  sampleRateHz: number | null;
  bitDepth: number | null;
  channels: number | null;
  channelLayout: string | null;
  embeddedTags: Record<string, string>;
  audioStreamCount: number;
}

function finitePositive(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sanitizeTags(
  ...sources: Array<Record<string, unknown> | undefined>
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const source of sources) {
    for (const [rawKey, rawValue] of Object.entries(source ?? {})) {
      if (Object.keys(output).length >= 20) return output;
      const key = rawKey.trim().toLowerCase().slice(0, 40);
      if (!ALLOWED_TAGS.has(key) || typeof rawValue !== "string") continue;
      const value = rawValue
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);
      if (value && !value.includes("\ufffd")) output[key] = value;
    }
  }
  return output;
}

export function parseFfprobeJson(raw: string): ProbedAudio {
  let payload: ProbePayload;
  try {
    payload = JSON.parse(raw) as ProbePayload;
  } catch {
    throw new Error("ffprobe returned malformed JSON");
  }
  const audioStreams = (payload.streams ?? [])
    .filter((stream) => stream.codec_type === "audio")
    .sort(
      (left, right) =>
        (right.disposition?.default ?? 0) - (left.disposition?.default ?? 0) ||
        (left.index ?? 0) - (right.index ?? 0),
    );
  const stream = audioStreams[0];
  if (!stream?.codec_name) throw new Error("No decodable audio stream exists");
  const durationSeconds =
    finitePositive(stream.duration) ?? finitePositive(payload.format?.duration);
  if (!durationSeconds) throw new Error("Audio duration is zero or invalid");
  const durationMs = Math.round(durationSeconds * 1000);
  if (durationMs < 1)
    throw new Error("Audio duration is below one millisecond");
  const container = payload.format?.format_name?.split(",")[0]?.trim();
  if (!container) throw new Error("Audio container could not be parsed");
  const rawBitDepth =
    finitePositive(stream.bits_per_raw_sample) ??
    finitePositive(stream.bits_per_sample);
  return {
    durationMs,
    containerFormat: container.slice(0, 80),
    codec: stream.codec_name.slice(0, 80),
    bitRateBps:
      finitePositive(stream.bit_rate) ??
      finitePositive(payload.format?.bit_rate),
    sampleRateHz: finitePositive(stream.sample_rate),
    bitDepth: rawBitDepth,
    channels: finitePositive(stream.channels),
    channelLayout: stream.channel_layout?.trim().slice(0, 80) || null,
    embeddedTags: sanitizeTags(payload.format?.tags, stream.tags),
    audioStreamCount: audioStreams.length,
  };
}

export async function probeAudioFile(
  filePath: string,
  timeoutMs: number,
): Promise<ProbedAudio> {
  const result = await runAudioTool({
    binary: "ffprobe",
    args: [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      filePath,
    ],
    timeoutMs,
  });
  try {
    return parseFfprobeJson(result.stdout);
  } catch (error) {
    throw new AudioToolError(
      "TOOL_FAILED",
      error instanceof Error ? error.message : "ffprobe result was invalid",
    );
  }
}
