import { describe, expect, it } from "vitest";

import { assertAudioSignature } from "./signature";

function wav(): Buffer {
  const value = Buffer.alloc(48);
  value.write("RIFF", 0);
  value.writeUInt32LE(40, 4);
  value.write("WAVE", 8);
  value.write("fmt ", 12);
  value.writeUInt32LE(16, 16);
  value.write("data", 36);
  value.writeUInt32LE(4, 40);
  return value;
}

function mp3(): Buffer {
  const value = Buffer.alloc(256);
  value.write("ID3", 0);
  value[3] = 3;
  value[10] = 0xff;
  value[11] = 0xfb;
  value[12] = 0x90;
  value[13] = 0x64;
  return value;
}

describe("stored audio signatures", () => {
  it("accepts WAV and MP3 only when their claimed extension matches", async () => {
    await expect(assertAudioSignature(wav(), ".wav")).resolves.toMatchObject({
      containerFormat: "wav",
      contentType: "audio/wav",
    });
    await expect(assertAudioSignature(mp3(), ".mp3")).resolves.toMatchObject({
      containerFormat: "mp3",
      contentType: "audio/mpeg",
    });
    await expect(assertAudioSignature(mp3(), ".wav")).rejects.toThrow(
      /does not match/i,
    );
    await expect(
      assertAudioSignature(Buffer.from("MZ executable"), ".mp3"),
    ).rejects.toThrow();
  });
});
