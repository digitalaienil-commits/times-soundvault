import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAuthState } from "@/lib/auth/current-user";
import {
  generateMusicTrack,
  saveGeneratedTrackAsDraft,
  GenerationServiceError,
} from "@/lib/generation/service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const state = await getAuthState();
  if (state.kind !== "authenticated") {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      [key: string]: unknown;
    };

    if (body.action === "generate") {
      const result = await generateMusicTrack(state.user, {
        prompt: String(body.prompt ?? ""),
        provider: body.provider as
          "google_lyria" | "elevenlabs" | "simulated" | undefined,
        model: body.model ? String(body.model) : undefined,
        durationSeconds:
          typeof body.durationSeconds === "number" ? body.durationSeconds : 30,
        instrumentalOnly:
          typeof body.instrumentalOnly === "boolean"
            ? body.instrumentalOnly
            : true,
        tempoBpm: typeof body.tempoBpm === "number" ? body.tempoBpm : null,
        genre: body.genre ? String(body.genre) : null,
        seed: typeof body.seed === "number" ? body.seed : null,
        dryRun: typeof body.dryRun === "boolean" ? body.dryRun : undefined,
      });

      return NextResponse.json({ ok: true, data: result });
    }

    if (body.action === "save_draft") {
      const result = await saveGeneratedTrackAsDraft(state.user, {
        audioBase64: String(body.audioBase64 ?? ""),
        mimeType: (body.mimeType as "audio/wav" | "audio/mpeg") ?? "audio/wav",
        containerFormat: (body.containerFormat as "wav" | "mp3") ?? "wav",
        durationMs:
          typeof body.durationMs === "number" ? body.durationMs : 30000,
        provider: String(body.provider ?? "simulated"),
        model: String(body.model ?? "simulated-v1"),
        prompt: String(body.prompt ?? ""),
        parameters: (body.parameters as Record<string, unknown>) ?? {},
        isSimulated: Boolean(body.isSimulated),
        workingTitle: body.workingTitle ? String(body.workingTitle) : undefined,
      });

      return NextResponse.json({ ok: true, data: result });
    }

    return NextResponse.json(
      { error: `Unsupported generation action: ${body.action}` },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof GenerationServiceError) {
      const status = error.code === "UNAUTHORIZED" ? 403 : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }

    const message =
      error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
