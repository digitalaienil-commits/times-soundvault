import "server-only";

import { fileTypeFromBuffer } from "file-type";

import type { AcceptedAudioExtension } from "@/types/uploads";

export async function assertAudioSignature(
  prefix: Uint8Array,
  extension: AcceptedAudioExtension,
): Promise<{
  contentType: "audio/wav" | "audio/mpeg";
  containerFormat: "wav" | "mp3";
}> {
  const header = Buffer.from(prefix);
  const hasWavSignature =
    header.length >= 12 &&
    header.subarray(0, 4).toString("ascii") === "RIFF" &&
    header.subarray(8, 12).toString("ascii") === "WAVE";
  if (extension === ".wav" && hasWavSignature) {
    return { contentType: "audio/wav", containerFormat: "wav" };
  }
  const detected = await fileTypeFromBuffer(Uint8Array.from(prefix));
  if (extension === ".mp3" && detected?.ext === "mp3") {
    return { contentType: "audio/mpeg", containerFormat: "mp3" };
  }
  throw new Error(
    "The stored file signature does not match its WAV or MP3 extension",
  );
}
