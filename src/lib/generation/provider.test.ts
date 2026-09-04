import { describe, expect, it } from "vitest";
import { GoogleLyriaProvider } from "./google-lyria-provider";
import { ElevenLabsMusicProvider } from "./elevenlabs-provider";
import { SimulatedMusicProvider } from "./provider";

describe("MusicGenerationProviders (Dry Run & Simulated)", () => {
  it("SimulatedMusicProvider returns valid PCM WAV buffer", async () => {
    const provider = new SimulatedMusicProvider();
    const result = await provider.generate({
      assetKind: "music",
      prompt: "Gentle acoustic morning theme",
      provider: "simulated",
      model: "simulated-v1",
      durationSeconds: 10,
      instrumentalOnly: true,
    });

    expect(result.isSimulated).toBe(true);
    expect(result.mimeType).toBe("audio/wav");
    expect(result.containerFormat).toBe("wav");
    expect(result.durationMs).toBe(10000);
    expect(result.audioBuffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(result.audioBuffer.subarray(8, 12).toString("ascii")).toBe("WAVE");
  });

  it("GoogleLyriaProvider in dry run returns simulated audio without API calls", async () => {
    const provider = new GoogleLyriaProvider({ apiKey: undefined });
    const result = await provider.generate({
      assetKind: "music",
      prompt: "Cinematic breaking news fanfare",
      provider: "google_lyria",
      model: "lyria-3-clip-preview",
      durationSeconds: 20,
      instrumentalOnly: true,
      dryRun: true,
    });

    expect(result.isSimulated).toBe(true);
    expect(result.provider).toBe("google_lyria");
    expect(result.model).toBe("lyria-3-clip-preview");
    expect(result.audioBuffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(result.parameters.watermark).toBe("SynthID");
  });

  it("GoogleLyriaProvider caps lyria-3-clip-preview at 30 seconds", async () => {
    const provider = new GoogleLyriaProvider({ apiKey: undefined });
    const result = await provider.generate({
      assetKind: "music",
      prompt: "Quick clip",
      provider: "google_lyria",
      model: "lyria-3-clip-preview",
      durationSeconds: 90, // Requested 90s on 30s clip model
      instrumentalOnly: true,
      dryRun: true,
    });

    expect(result.durationMs).toBe(30000);
  });

  it("ElevenLabsMusicProvider in dry run returns simulated audio", async () => {
    const provider = new ElevenLabsMusicProvider({ apiKey: undefined });
    const result = await provider.generate({
      assetKind: "music",
      prompt: "Upbeat electronic pulse",
      provider: "elevenlabs",
      model: "music_v2",
      durationSeconds: 15,
      instrumentalOnly: true,
      dryRun: true,
    });

    expect(result.isSimulated).toBe(true);
    expect(result.provider).toBe("elevenlabs");
    expect(result.model).toBe("music_v2");
    expect(result.audioBuffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("ElevenLabsMusicProvider supports sound effects in dry run", async () => {
    const provider = new ElevenLabsMusicProvider({ apiKey: undefined });
    const result = await provider.generate({
      assetKind: "sound_effect",
      prompt: "Short news transition whoosh",
      provider: "elevenlabs",
      model: "eleven_text_to_sound_v2",
      durationSeconds: 3,
      instrumentalOnly: true,
      loop: false,
      dryRun: true,
    });

    expect(result.assetKind).toBe("sound_effect");
    expect(result.isSimulated).toBe(true);
    expect(result.provider).toBe("elevenlabs");
    expect(result.model).toBe("eleven_text_to_sound_v2");
    expect(result.audioBuffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });
});
