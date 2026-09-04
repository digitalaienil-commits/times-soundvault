"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AudioLines,
  CheckCircle2,
  FileCheck,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClientGenerationResponse } from "@/lib/generation/service";

interface GenerationWorkspaceProps {
  initialDryRun: boolean;
  defaultProvider: "google_lyria" | "elevenlabs" | "simulated";
}

export function GenerationWorkspace({
  initialDryRun,
  defaultProvider,
}: GenerationWorkspaceProps) {
  const [provider, setProvider] = useState<
    "google_lyria" | "elevenlabs" | "simulated"
  >(defaultProvider === "simulated" ? "google_lyria" : defaultProvider);
  const [model, setModel] = useState<string>("lyria-3-clip-preview");
  const [prompt, setPrompt] = useState<string>("");
  const [durationSeconds, setDurationSeconds] = useState<number>(30);
  const [instrumentalOnly, setInstrumentalOnly] = useState<boolean>(true);
  const [tempoBpm, setTempoBpm] = useState<string>("");
  const [genre, setGenre] = useState<string>("");
  const [isDryRun, setIsDryRun] = useState<boolean>(initialDryRun);

  const [isGenerating, startGenerating] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const [result, setResult] = useState<ClientGenerationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedSubmission, setSavedSubmission] = useState<{
    submissionId: string;
    trackId: string;
  } | null>(null);
  const [workingTitle, setWorkingTitle] = useState<string>("");

  const handleProviderChange = (newProvider: "google_lyria" | "elevenlabs") => {
    setProvider(newProvider);
    if (newProvider === "google_lyria") {
      setModel("lyria-3-clip-preview");
      if (durationSeconds > 30 && model === "lyria-3-clip-preview") {
        setDurationSeconds(30);
      }
    } else {
      setModel("music_v2");
    }
  };

  const handleGenerate = () => {
    if (!prompt.trim()) {
      setError("Please provide a prompt describing the music to generate.");
      return;
    }

    setError(null);
    setSavedSubmission(null);

    startGenerating(async () => {
      try {
        const response = await fetch("/api/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate",
            prompt: prompt.trim(),
            provider,
            model,
            durationSeconds,
            instrumentalOnly,
            tempoBpm: tempoBpm ? parseInt(tempoBpm, 10) : null,
            genre: genre.trim() || null,
            dryRun: isDryRun,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to generate audio.");
        }

        setResult(data.data as ClientGenerationResponse);
        setWorkingTitle(`AI Generated — ${prompt.slice(0, 36).trim()}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed.");
      }
    });
  };

  const handleSaveDraft = () => {
    if (!result) return;
    setError(null);

    startSaving(async () => {
      try {
        // Extract base64 without data prefix
        const base64Data = result.audioDataUri.split(",")[1] ?? "";

        const response = await fetch("/api/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_draft",
            audioBase64: base64Data,
            mimeType: result.mimeType,
            containerFormat: result.mimeType.includes("mpeg") ? "mp3" : "wav",
            durationMs: result.durationMs,
            provider: result.provider,
            model: result.model,
            prompt: result.prompt,
            parameters: result.parameters,
            isSimulated: result.isSimulated,
            workingTitle: workingTitle.trim() || undefined,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to save draft submission.");
        }

        setSavedSubmission(
          data.data as { submissionId: string; trackId: string },
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save draft.");
      }
    });
  };

  return (
    <div className="mt-6 space-y-8">
      {/* Configuration Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 text-sm sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Sparkles className="size-4" aria-hidden="true" />
          </div>
          <div>
            <span className="font-semibold text-foreground">
              Generation Environment:{" "}
            </span>
            <span className="text-muted-foreground">
              {isDryRun ? "Dry-run simulation mode" : "Live provider mode"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isDryRun ? "secondary" : "default"}>
            {isDryRun ? "Dry Run (Zero Billing)" : "Live API Active"}
          </Badge>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={isDryRun}
              onChange={(e) => setIsDryRun(e.target.checked)}
              className="size-4 rounded border-border text-brand focus:ring-brand"
            />
            Force Dry Run
          </label>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <p className="font-semibold">Generation error</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Generation Settings & Prompt Form */}
        <section
          aria-labelledby="generation-form-heading"
          className="rounded-xl border border-border bg-surface p-6 sm:p-7 lg:col-span-7"
        >
          <h2
            id="generation-form-heading"
            className="text-lg font-semibold text-foreground"
          >
            Generate Music
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Create internal musical assets using Google Lyria 3 or ElevenLabs
            Music. Output enters SoundVault strictly as an unpublished draft.
          </p>

          <div className="mt-6 space-y-5">
            {/* Provider Tabs */}
            <div>
              <label className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                AI Music Provider
              </label>
              <div
                className="mt-2 grid grid-cols-2 gap-3"
                role="radiogroup"
                aria-label="Music provider"
              >
                <button
                  type="button"
                  onClick={() => handleProviderChange("google_lyria")}
                  className={`flex flex-col items-start rounded-lg border p-3.5 text-left transition-colors ${
                    provider === "google_lyria"
                      ? "border-brand bg-brand-soft/20 text-foreground"
                      : "border-border bg-background/50 text-muted-foreground hover:bg-muted"
                  }`}
                  role="radio"
                  aria-checked={provider === "google_lyria"}
                >
                  <span className="text-sm font-semibold text-foreground">
                    Google Lyria 3
                  </span>
                  <span className="mt-0.5 text-xs text-muted-foreground">
                    DeepMind Clip & Pro Models
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleProviderChange("elevenlabs")}
                  className={`flex flex-col items-start rounded-lg border p-3.5 text-left transition-colors ${
                    provider === "elevenlabs"
                      ? "border-brand bg-brand-soft/20 text-foreground"
                      : "border-border bg-background/50 text-muted-foreground hover:bg-muted"
                  }`}
                  role="radio"
                  aria-checked={provider === "elevenlabs"}
                >
                  <span className="text-sm font-semibold text-foreground">
                    ElevenLabs
                  </span>
                  <span className="mt-0.5 text-xs text-muted-foreground">
                    Music v2 Generation API
                  </span>
                </button>
              </div>
            </div>

            {/* Model Variant Selector */}
            {provider === "google_lyria" ? (
              <div>
                <label
                  htmlFor="lyria-model"
                  className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Model Variant
                </label>
                <select
                  id="lyria-model"
                  value={model}
                  onChange={(e) => {
                    const newModel = e.target.value;
                    setModel(newModel);
                    if (
                      newModel === "lyria-3-clip-preview" &&
                      durationSeconds > 30
                    ) {
                      setDurationSeconds(30);
                    }
                  }}
                  className="mt-2 h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                >
                  <option value="lyria-3-clip-preview">
                    lyria-3-clip-preview (Fast 30s clips, prototyping)
                  </option>
                  <option value="lyria-3-pro-preview">
                    lyria-3-pro-preview (Studio quality, structured full piece)
                  </option>
                </select>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="elevenlabs-model"
                  className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Model Variant
                </label>
                <select
                  id="elevenlabs-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                >
                  <option value="music_v2">
                    music_v2 (Recommended, modern composition)
                  </option>
                  <option value="music_v1">music_v1 (Legacy model)</option>
                </select>
              </div>
            )}

            {/* Prompt Textarea */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="generation-prompt"
                  className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Prompt Description *
                </label>
                <span className="text-xs text-muted-foreground">
                  {prompt.length} / 500
                </span>
              </div>
              <textarea
                id="generation-prompt"
                rows={4}
                maxLength={500}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='E.g., "Urgent breaking news theme with driving percussion, tense strings, and bold brass fanfares for Times Now headline bulletin."'
                className="mt-2 w-full rounded-lg border border-input bg-surface p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
            </div>

            {/* Quick Inspiration Prompts */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>Try:</span>
              <button
                type="button"
                onClick={() =>
                  setPrompt(
                    "High energy upbeat Diwali celebration track with dhol, shehnai, and acoustic guitars",
                  )
                }
                className="rounded border border-border px-2 py-0.5 hover:bg-muted"
              >
                Diwali Dhol Celebration
              </button>
              <button
                type="button"
                onClick={() =>
                  setPrompt(
                    "Dark cinematic tension drone with sub-bass pulses and ticking clock motif for investigative documentary",
                  )
                }
                className="rounded border border-border px-2 py-0.5 hover:bg-muted"
              >
                Investigative Documentary
              </button>
              <button
                type="button"
                onClick={() =>
                  setPrompt(
                    "Warm corporate acoustic guitar and light piano background for financial news interview",
                  )
                }
                className="rounded border border-border px-2 py-0.5 hover:bg-muted"
              >
                Corporate Acoustic
              </button>
            </div>

            {/* Duration and Musical Controls */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="duration-seconds"
                  className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Duration ({durationSeconds}s)
                </label>
                <input
                  id="duration-seconds"
                  type="range"
                  min="5"
                  max={model === "lyria-3-clip-preview" ? "30" : "180"}
                  step="5"
                  value={durationSeconds}
                  onChange={(e) =>
                    setDurationSeconds(parseInt(e.target.value, 10))
                  }
                  className="mt-3 w-full accent-brand"
                />
              </div>

              <div>
                <label
                  htmlFor="tempo-bpm"
                  className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Tempo (BPM)
                </label>
                <Input
                  id="tempo-bpm"
                  type="number"
                  min="40"
                  max="240"
                  placeholder="e.g. 120"
                  value={tempoBpm}
                  onChange={(e) => setTempoBpm(e.target.value)}
                  className="mt-2 h-10"
                />
              </div>

              <div>
                <label
                  htmlFor="style-genre"
                  className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Genre / Mood
                </label>
                <Input
                  id="style-genre"
                  type="text"
                  placeholder="e.g. Cinematic"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="mt-2 h-10"
                />
              </div>
            </div>

            {/* Instrumental Toggle */}
            <div className="flex items-center gap-3 pt-1">
              <input
                id="instrumental-only"
                type="checkbox"
                checked={instrumentalOnly}
                onChange={(e) => setInstrumentalOnly(e.target.checked)}
                className="size-4 rounded border-border text-brand focus:ring-brand"
              />
              <label
                htmlFor="instrumental-only"
                className="text-sm font-medium text-foreground"
              >
                Force instrumental (strictly no vocals)
              </label>
            </div>

            {/* Generate Action */}
            <div className="pt-2">
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="h-11 w-full gap-2 text-sm font-semibold"
              >
                {isGenerating ? (
                  <>
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                    Generating music audio…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" aria-hidden="true" />
                    Generate Audio
                  </>
                )}
              </Button>
            </div>
          </div>
        </section>

        {/* Right Column: Audio Preview, Provenance & Save as Draft */}
        <section
          aria-labelledby="generation-output-heading"
          className="flex flex-col rounded-xl border border-border bg-surface p-6 sm:p-7 lg:col-span-5"
        >
          <h2
            id="generation-output-heading"
            className="text-lg font-semibold text-foreground"
          >
            Generation Output
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Audition generated audio and review immutable provenance before
            saving to draft.
          </p>

          {result ? (
            <div className="mt-6 flex-1 space-y-6">
              {/* Audio Player Card */}
              <div className="rounded-xl border border-border/80 bg-background/50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <AudioLines className="size-4" aria-hidden="true" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-foreground">
                        Audio Preview
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {Math.round(result.durationMs / 1000)}s &bull;{" "}
                        {result.mimeType}
                      </p>
                    </div>
                  </div>
                  {result.isSimulated ? (
                    <Badge variant="outline" className="text-[11px]">
                      Simulated
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-[11px] text-brand"
                    >
                      Live Output
                    </Badge>
                  )}
                </div>

                <div className="mt-4">
                  <audio
                    controls
                    src={result.audioDataUri}
                    className="w-full rounded-lg"
                    aria-label="Generated audio preview"
                  />
                </div>
              </div>

              {/* Provenance Card */}
              <div className="rounded-xl border border-border/80 bg-background/50 p-5 text-xs">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <ShieldCheck
                    className="size-4 text-brand"
                    aria-hidden="true"
                  />
                  AI Provenance Record
                </div>

                <dl className="mt-4 space-y-2.5">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Provider</dt>
                    <dd className="font-medium text-foreground">
                      {result.provider}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Model</dt>
                    <dd className="font-mono font-medium text-foreground">
                      {result.model}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Request ID</dt>
                    <dd className="max-w-[180px] truncate font-mono text-muted-foreground">
                      {result.id}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Watermarking</dt>
                    <dd className="font-medium text-foreground">
                      SynthID Audio Provenance
                    </dd>
                  </div>
                  <div className="pt-1">
                    <dt className="text-muted-foreground">Prompt Record</dt>
                    <dd className="mt-1 rounded border border-border/60 bg-muted/40 p-2 font-mono text-[11px] text-foreground">
                      {result.prompt}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Save as Draft Form */}
              {savedSubmission ? (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-700 dark:text-emerald-300"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                    Saved as Draft Submission
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Generated audio has been safely stored in private storage
                    and added as an unpublished draft submission.
                  </p>
                  <div className="mt-4">
                    <Button asChild size="sm" className="gap-2">
                      <Link
                        href={`/submissions/${savedSubmission.submissionId}`}
                      >
                        <FileCheck className="size-4" aria-hidden="true" />
                        View Draft Submission
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 rounded-xl border border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground">
                    Save as Draft Submission
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Enters the existing SoundVault workflow (technical
                    processing, copyright verification, and Coordinator review).
                    Never auto-publishes.
                  </p>
                  <div>
                    <label
                      htmlFor="working-title"
                      className="block text-xs font-semibold text-muted-foreground"
                    >
                      Working Title
                    </label>
                    <Input
                      id="working-title"
                      type="text"
                      value={workingTitle}
                      onChange={(e) => setWorkingTitle(e.target.value)}
                      placeholder="Title for submission"
                      className="mt-1.5 h-10"
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isSaving}
                    variant="outline"
                    className="h-10 w-full gap-2 text-sm font-semibold"
                  >
                    {isSaving ? (
                      <>
                        <Loader2
                          className="size-4 animate-spin"
                          aria-hidden="true"
                        />
                        Saving draft…
                      </>
                    ) : (
                      <>
                        <FileCheck className="size-4" aria-hidden="true" />
                        Commit as Draft Submission
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-12 flex flex-1 flex-col items-center justify-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-background/50 text-muted-foreground">
                <AudioLines className="size-6" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-foreground">
                No audio generated yet
              </h3>
              <p className="mt-1.5 max-w-xs text-xs text-muted-foreground">
                Enter a music prompt on the left and click &quot;Generate
                Audio&quot; to audition preview tracks and create draft
                submissions.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
