import { describe, expect, it } from "vitest";
import { createWaveformAccumulator } from "./waveform";

describe("streaming waveform peaks", () => {
  it("keeps interleaved min/max bins across chunk boundaries", () => {
    const pcm = Buffer.alloc(16);
    [-10, 20, -30, 40, -50, 60, -70, 80].forEach((value, index) =>
      pcm.writeInt16LE(value, index * 2),
    );
    const waveform = createWaveformAccumulator(8, 4);
    waveform.push(pcm.subarray(0, 5));
    waveform.push(pcm.subarray(5));
    expect(waveform.finish()).toEqual([-10, 20, -30, 40, -50, 60, -70, 80]);
    expect(waveform.sampleCount).toBe(8);
  });
});
