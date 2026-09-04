import "server-only";

import { parseGenerationConfig } from "./config";
import { ElevenLabsMusicProvider } from "./elevenlabs-provider";
import { GoogleLyriaProvider } from "./google-lyria-provider";
import {
  type MusicGenerationProvider,
  SimulatedMusicProvider,
} from "./provider";

export function createMusicGenerationProvider(
  requestedProvider?: string,
): MusicGenerationProvider {
  const config = parseGenerationConfig();
  const providerKey = requestedProvider ?? config.provider;

  if (providerKey === "google_lyria") {
    return new GoogleLyriaProvider({
      apiKey: config.geminiApiKey,
    });
  }

  if (providerKey === "elevenlabs") {
    return new ElevenLabsMusicProvider({
      apiKey: config.elevenLabsApiKey,
    });
  }

  return new SimulatedMusicProvider();
}
