import "server-only";

import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

import { loadEnvConfig } from "@next/env";

import { parseAiAnalysisConfig } from "@/lib/analysis/config";
import { createUnifiedAiMetadata } from "@/lib/analysis/gemini-metadata";
import { extractLocalMusicFeatures } from "@/lib/analysis/local-features";
import { measureAudioFile } from "@/lib/audio/ffmpeg";
import { probeAudioFile } from "@/lib/audio/ffprobe";
import type { ProcessingSourceFile } from "@/lib/processing/repository";

loadEnvConfig(process.cwd());

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          Buffer.concat(stderr).toString("utf8").trim() ||
            `${command} exited with ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

async function main() {
  const config = parseAiAnalysisConfig();
  const workDir = await mkdtemp(path.join(tmpdir(), "soundvault-analysis-"));
  const audioPath = path.join(workDir, "verify-tone.wav");
  try {
    await run("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-ar",
      "44100",
      "-ac",
      "2",
      audioPath,
    ]);

    const source: ProcessingSourceFile = {
      audioFileId: "00000000-0000-4000-8000-000000000001",
      assetId: "00000000-0000-4000-8000-000000000002",
      submissionId: "00000000-0000-4000-8000-000000000003",
      submissionRevisionId: "00000000-0000-4000-8000-000000000004",
      trackId: "00000000-0000-4000-8000-000000000005",
      ownerUserId: "local-verify",
      assetRole: "master",
      stemType: null,
      displayTitle: "Local verification tone",
      originalFilename: "verify-tone.wav",
      storageBackend: "local",
      storageKey: audioPath,
      providerDriveId: null,
      providerItemId: null,
      byteSize: 0,
      extension: ".wav",
    };

    const probe = await probeAudioFile(audioPath, 30_000);
    const measurements = await measureAudioFile(
      audioPath,
      probe.durationMs,
      30_000,
    );
    const features = await extractLocalMusicFeatures(audioPath, {
      sampleRateHz: config.sampleRateHz,
      maxDurationSeconds: config.maxDurationSeconds,
      timeoutMs: config.timeoutMs,
    });

    if (!config.enabled || !config.geminiApiKey) {
      console.log(
        JSON.stringify(
          {
            status: "local-ok-gemini-skipped",
            reason: config.enabled
              ? "GEMINI_API_KEY missing"
              : "AI_ANALYSIS_ENABLED disabled",
            ffprobe: {
              durationMs: probe.durationMs,
              codec: probe.codec,
              sampleRateHz: probe.sampleRateHz,
            },
            essentia: {
              version: features.essentiaVersion,
              bpm: features.bpm,
              key: features.key,
              rms: features.rms,
            },
          },
          null,
          2,
        ),
      );
      return;
    }

    const metadata = await createUnifiedAiMetadata(config, {
      source,
      probe,
      measurements,
      features,
    });

    console.log(
      JSON.stringify(
        {
          status: "ok",
          model: config.model,
          ffprobe: {
            durationMs: probe.durationMs,
            codec: probe.codec,
            sampleRateHz: probe.sampleRateHz,
          },
          essentia: {
            version: features.essentiaVersion,
            bpm: features.bpm,
            key: features.key,
            rms: features.rms,
          },
          gemini: {
            genres: metadata.normalizedResult.genres,
            moods: metadata.normalizedResult.moods,
            bpm: metadata.normalizedResult.bpm,
            key: metadata.normalizedResult.key,
            caption: metadata.normalizedResult.transformerCaption,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
