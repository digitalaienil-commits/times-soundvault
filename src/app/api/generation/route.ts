import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAuthState } from "@/lib/auth/current-user";
import {
  generateAudioDraft,
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
      const result = await generateAudioDraft(state.user, {
        assetKind: body.assetKind === "sound_effect" ? "sound_effect" : "music",
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
        loop: typeof body.loop === "boolean" ? body.loop : undefined,
        promptInfluence:
          typeof body.promptInfluence === "number"
            ? body.promptInfluence
            : null,
      });

      return NextResponse.json({ ok: true, data: result });
    }

    if (body.action === "save_draft") {
      const result = await saveGeneratedTrackAsDraft(state.user, {
        generationId: String(body.generationId ?? ""),
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
