import "server-only";

import { spawn } from "node:child_process";

const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;

export class AudioToolError extends Error {
  constructor(
    public readonly code:
      "TOOL_MISSING" | "TOOL_TIMEOUT" | "TOOL_OUTPUT_LIMIT" | "TOOL_FAILED",
    message: string,
    public readonly stderr = "",
  ) {
    super(message);
    this.name = "AudioToolError";
  }
}

export async function runAudioTool(input: {
  binary: "ffmpeg" | "ffprobe";
  args: readonly string[];
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.binary, [...input.args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      signal: input.signal,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let captured = 0;
    let outputExceeded = false;
    const capture = (target: Buffer[], chunk: Buffer) => {
      captured += chunk.length;
      if (captured > MAX_CAPTURE_BYTES) {
        outputExceeded = true;
        child.kill("SIGKILL");
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => capture(stderr, chunk));
    const timeout = setTimeout(() => child.kill("SIGKILL"), input.timeoutMs);
    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      reject(
        new AudioToolError(
          error.code === "ENOENT" ? "TOOL_MISSING" : "TOOL_FAILED",
          `${input.binary} could not be started`,
        ),
      );
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      const stdoutText = Buffer.concat(stdout).toString("utf8");
      const stderrText = Buffer.concat(stderr).toString("utf8");
      if (outputExceeded) {
        reject(
          new AudioToolError(
            "TOOL_OUTPUT_LIMIT",
            `${input.binary} exceeded the bounded output limit`,
          ),
        );
        return;
      }
      if (signal === "SIGKILL") {
        reject(
          new AudioToolError(
            "TOOL_TIMEOUT",
            `${input.binary} exceeded its processing timeout`,
            stderrText,
          ),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new AudioToolError(
            "TOOL_FAILED",
            `${input.binary} rejected the audio source`,
            stderrText,
          ),
        );
        return;
      }
      resolve({ stdout: stdoutText, stderr: stderrText });
    });
  });
}

export async function getAudioToolVersion(
  binary: "ffmpeg" | "ffprobe",
  timeoutMs = 10_000,
): Promise<string> {
  const result = await runAudioTool({
    binary,
    args: ["-version"],
    timeoutMs,
  });
  return result.stdout.split("\n")[0]?.trim().slice(0, 200) || binary;
}
