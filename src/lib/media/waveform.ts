export function createWaveformAccumulator(
  totalSamples: number,
  peakCount: number,
) {
  if (!Number.isSafeInteger(totalSamples) || totalSamples <= 0)
    throw new Error("Waveform sample count must be positive");
  if (!Number.isSafeInteger(peakCount) || peakCount <= 0)
    throw new Error("Waveform peak count must be positive");
  const minimum = new Int16Array(peakCount);
  const maximum = new Int16Array(peakCount);
  minimum.fill(32767);
  maximum.fill(-32768);
  let sampleIndex = 0;
  let carry: number | null = null;

  return {
    push(chunk: Uint8Array) {
      let offset = 0;
      if (carry !== null && chunk.length) {
        const raw = carry | (chunk[0]! << 8);
        const value = raw >= 0x8000 ? raw - 0x10000 : raw;
        const bin = Math.min(
          peakCount - 1,
          Math.floor((sampleIndex * peakCount) / totalSamples),
        );
        minimum[bin] = Math.min(minimum[bin]!, value);
        maximum[bin] = Math.max(maximum[bin]!, value);
        sampleIndex += 1;
        carry = null;
        offset = 1;
      }
      for (; offset + 1 < chunk.length; offset += 2) {
        const raw = chunk[offset]! | (chunk[offset + 1]! << 8);
        const value = raw >= 0x8000 ? raw - 0x10000 : raw;
        const bin = Math.min(
          peakCount - 1,
          Math.floor((sampleIndex * peakCount) / totalSamples),
        );
        minimum[bin] = Math.min(minimum[bin]!, value);
        maximum[bin] = Math.max(maximum[bin]!, value);
        sampleIndex += 1;
      }
      if (offset < chunk.length) carry = chunk[offset]!;
    },
    finish(): number[] {
      if (carry !== null) throw new Error("Waveform PCM ended mid-sample");
      const peaks: number[] = [];
      for (let index = 0; index < peakCount; index += 1) {
        peaks.push(
          minimum[index] === 32767 ? 0 : minimum[index]!,
          maximum[index] === -32768 ? 0 : maximum[index]!,
        );
      }
      return peaks;
    },
    get sampleCount() {
      return sampleIndex;
    },
  };
}
