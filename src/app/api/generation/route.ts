import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAuthState } from "@/lib/auth/current-user";
import { unexpectedErrorResponse } from "@/lib/http/error-response";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/http/rate-limit";
import { readJsonBody } from "@/lib/http/request-body";
import {
  generateAudioDraft,
  saveGeneratedTrackAsDraft,
  GenerationServiceError,
} from "@/lib/generation/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prompts and parameters are small; anything larger is not a real request. */
const GENERATION_BODY_LIMIT_BYTES = 32 * 1024;

function rateLimited(retryAfterSeconds: number): NextResponse {
  const response = NextResponse.json(
    { error: "Too many generation requests. Please wait and try again." },
    { status: 429 },
  );
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

export async function POST(request: NextRequest) {
  const state = await getAuthState();
  if (state.kind !== "authenticated") {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = await readJsonBody<{ action?: string; [key: string]: unknown }>(
    request,
    GENERATION_BODY_LIMIT_BYTES,
  );
  if (body.kind === "too-large") {
    return NextResponse.json(
      { error: "Generation request is too large." },
      { status: 413 },
    );
  }
  if (body.kind === "invalid") {
    return NextResponse.json(
      { error: "Generation request body must be JSON." },
      { status: 400 },
    );
  }
  const payload = body.value;

  try {
    if (payload.action === "generate") {
      const limit = await consumeRateLimit(
        RATE_LIMITS.generation,
        state.user.id,
      );
      if (!limit.allowed) {
        return rateLimited(limit.retryAfterSeconds);
      }

      const result = await generateAudioDraft(state.user, {
        assetKind:
          payload.assetKind === "sound_effect" ? "sound_effect" : "music",
        prompt: String(payload.prompt ?? ""),
        provider: payload.provider as
          "google_lyria" | "elevenlabs" | "simulated" | undefined,
        model: payload.model ? String(payload.model) : undefined,
        durationSeconds:
          typeof payload.durationSeconds === "number"
            ? payload.durationSeconds
            : 30,
        instrumentalOnly:
          typeof payload.instrumentalOnly === "boolean"
            ? payload.instrumentalOnly
            : true,
        tempoBpm:
          typeof payload.tempoBpm === "number" ? payload.tempoBpm : null,
        genre: payload.genre ? String(payload.genre) : null,
        seed: typeof payload.seed === "number" ? payload.seed : null,
        loop: typeof payload.loop === "boolean" ? payload.loop : undefined,
        promptInfluence:
          typeof payload.promptInfluence === "number"
            ? payload.promptInfluence
            : null,
      });

      return NextResponse.json({ ok: true, data: result });
    }

    if (payload.action === "save_draft") {
      const limit = await consumeRateLimit(
        RATE_LIMITS.generationCommit,
        state.user.id,
      );
      if (!limit.allowed) {
        return rateLimited(limit.retryAfterSeconds);
      }

      const result = await saveGeneratedTrackAsDraft(state.user, {
        generationId: String(payload.generationId ?? ""),
        workingTitle: payload.workingTitle
          ? String(payload.workingTitle)
          : undefined,
      });

      return NextResponse.json({ ok: true, data: result });
    }

    return NextResponse.json(
      { error: "Unsupported generation action." },
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

    return unexpectedErrorResponse("api/generation", error);
  }
}
