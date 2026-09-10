import "server-only";

import { spawn } from "node:child_process";

import { AudioToolError } from "./process";

export interface AnalysisExcerpt {
  bytes: Buffer;
  mimeType: "audio/mpeg";
  durationSeconds: number;
  bitrateKbps: number;
  sampleRateHz: number;
}

/**
 * Encodes a bounded, compact excerpt of a Master for semantic AI analysis.
 *
 * The provider is billed per audio token and the source may be a multi-hundred
 * megabyte WAV, so the excerpt is deliberately small: mono, low sample rate and
 * bitrate, and capped in both duration and bytes. It is an analysis input only
 * — never a catalog asset, never delivered to a browser, and never written to
 * disk.
 */
export async function encodeAnalysisExcerpt(
  filePath: string,
  options: {
    maxDurationSeconds: number;
    bitrateKbps: number;
    sampleRateHz: number;
    maxBytes: number;
    timeoutMs: number;
  },
): Promise<AnalysisExcerpt> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        filePath,
        "-map",
        "0:a:0",
        "-vn",
        "-sn",
        "-dn",
        "-ac",
        "1",
        "-ar",
        String(options.sampleRateHz),
        "-t",
        String(options.maxDurationSeconds),
        "-b:a",
        `${options.bitrateKbps}k`,
        "-f",
        "mp3",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const finish = (error: Error | null, value?: AnalysisExcerpt) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      if (error) reject(error);
      else resolve(value as AnalysisExcerpt);
    };

    const timer = setTimeout(() => {
      finish(
        new AudioToolError(
          "TOOL_TIMEOUT",
          `ffmpeg analysis excerpt timed out after ${options.timeoutMs}ms`,
        ),
      );
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > options.maxBytes) {
        finish(
          new AudioToolError(
            "TOOL_OUTPUT_LIMIT",
            "ffmpeg analysis excerpt exceeded the configured byte limit",
          ),
        );
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      finish(
        new AudioToolError(
          "TOOL_MISSING",
          error instanceof Error
            ? error.message
            : "ffmpeg analysis excerpt failed",
        ),
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(
          new AudioToolError(
            "TOOL_FAILED",
            Buffer.concat(stderr).toString().trim() ||
              `ffmpeg analysis excerpt exited with code ${code ?? "unknown"}`,
          ),
        );
        return;
      }
      const bytes = Buffer.concat(stdout);
      if (bytes.byteLength === 0) {
        finish(
          new AudioToolError(
            "TOOL_FAILED",
            "ffmpeg analysis excerpt produced no audio",
          ),
        );
        return;
      }
      finish(null, {
        bytes,
        mimeType: "audio/mpeg",
        durationSeconds: options.maxDurationSeconds,
        bitrateKbps: options.bitrateKbps,
        sampleRateHz: options.sampleRateHz,
      });
    });
  });
}
