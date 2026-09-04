import "server-only";

/**
 * Generates a valid 16-bit PCM stereo WAV buffer.
 * Used for dry-run generations and offline testing so that audio can be
 * played in the browser, examined by FFmpeg, and processed through the SoundVault pipeline.
 */
export function generateValidPcmWavBuffer(options: {
  durationSeconds: number;
  sampleRate?: number;
  frequency?: number;
}): Buffer {
  const sampleRate = options.sampleRate ?? 44100;
  const numChannels = 2;
  const bitsPerSample = 16;
  const durationSeconds = Math.max(1, Math.min(options.durationSeconds, 30));
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF chunk descriptor
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt sub-chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Generate a soft ambient chime / harmonic tone (A440 + harmonics with decay)
  const freq = options.frequency ?? 440;
  let offset = 44;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Envelope: soft attack (0.05s) and gentle decay
    const attack = Math.min(1, t / 0.05);
    const decay = Math.exp(-0.8 * (t % 2.0));
    const envelope = attack * decay;

    // Harmonic blend (fundamental + octaves)
    const wave =
      Math.sin(2 * Math.PI * freq * t) * 0.5 +
      Math.sin(2 * Math.PI * (freq * 1.5) * t) * 0.25 +
      Math.sin(2 * Math.PI * (freq * 2.0) * t) * 0.15;

    // 16-bit PCM integer between -32768 and 32767
    const sample = Math.floor(wave * envelope * 12000);

    // Left channel
    buffer.writeInt16LE(sample, offset);
    // Right channel (slight stereo pan)
    buffer.writeInt16LE(sample, offset + 2);

    offset += blockAlign;
  }

  return buffer;
}
