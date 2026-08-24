import "server-only";

export interface CopyrightProviderCapabilities {
  connected: boolean;
  automation: boolean;
  reason: string;
}

export interface CopyrightProvider {
  readonly name: "manual_youtube";
  getCapabilities(): CopyrightProviderCapabilities;
}

export class ManualYouTubeCopyrightProvider implements CopyrightProvider {
  readonly name = "manual_youtube" as const;

  getCapabilities(): CopyrightProviderCapabilities {
    return {
      connected: false,
      automation: false,
      reason:
        "YouTube automation is not configured. Results must be verified and recorded by a Coordinator or Admin.",
    };
  }
}

export function createCopyrightProvider(): CopyrightProvider {
  return new ManualYouTubeCopyrightProvider();
}
