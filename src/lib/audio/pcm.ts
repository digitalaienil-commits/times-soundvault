import "server-only";

import { spawn } from "node:child_process";

import { AudioToolError } from "./process";

export interface DecodedPcmAudio {
  signal: Float32Array;
  sampleRateHz: number;
  analyzedDurationMs: number;
}

export async function decodeMonoPcmForAnalysis(
  filePath: string,
  options: {
    sampleRateHz: number;
    maxDurationSeconds: number;
    timeoutMs: number;
  },
): Promise<DecodedPcmAudio> {
  const byteLimit =
    options.sampleRateHz *
      options.maxDurationSeconds *
      Float32Array.BYTES_PER_ELEMENT +
    4096;

  return new Promise((resolve, reject) => {
    const process = spawn(
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
        "-f",
        "f32le",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      process.kill("SIGKILL");
      reject(
        new AudioToolError(
          "TOOL_TIMEOUT",
          `ffmpeg PCM decoding timed out after ${options.timeoutMs}ms`,
        ),
      );
    }, options.timeoutMs);

    process.stdout.on("data", (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > byteLimit && !settled) {
        settled = true;
        clearTimeout(timer);
        process.kill("SIGKILL");
        reject(
          new AudioToolError(
            "TOOL_OUTPUT_LIMIT",
            "ffmpeg PCM decoding returned more audio than the analysis limit",
          ),
        );
        return;
      }
      stdoutChunks.push(chunk);
    });

    process.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    process.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new AudioToolError(
          "TOOL_FAILED",
          error instanceof Error ? error.message : "ffmpeg PCM decoding failed",
        ),
      );
    });

    process.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks)
          .toString("utf8")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500);
        reject(
          new AudioToolError(
            "TOOL_FAILED",
            stderr ||
              `ffmpeg PCM decoding exited with code ${code ?? "unknown"}`,
          ),
        );
        return;
      }

      const bytes = Buffer.concat(stdoutChunks);
      if (bytes.byteLength < Float32Array.BYTES_PER_ELEMENT) {
        reject(
          new AudioToolError(
            "TOOL_FAILED",
            "ffmpeg PCM decoding returned no analyzable audio",
          ),
        );
        return;
      }

      const alignedLength =
        bytes.byteLength - (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT);
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + alignedLength,
      );
      const signal = new Float32Array(arrayBuffer);
      resolve({
        signal,
        sampleRateHz: options.sampleRateHz,
        analyzedDurationMs: Math.round(
          (signal.length / options.sampleRateHz) * 1000,
        ),
      });
    });
  });
}
