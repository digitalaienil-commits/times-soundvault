"use client";

import { useMemo, useState, useTransition } from "react";
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

type AssetKind = "music" | "sound_effect";
type ProviderKind = "google_lyria" | "elevenlabs" | "simulated";

interface ModelOption {
  id: string;
  label: string;
  maxDurationSeconds: number;
}

interface ProviderOption {
  provider: ProviderKind;
  label: string;
  description: string;
  live: boolean;
  assetKinds: readonly AssetKind[];
  models: Partial<Record<AssetKind, readonly ModelOption[]>>;
}

interface GenerationWorkspaceProps {
  initialDryRun: boolean;
  defaultProvider: ProviderKind;
  providers: readonly ProviderOption[];
}

function labelForAssetKind(assetKind: AssetKind) {
  return assetKind === "sound_effect" ? "Sound Effects" : "Music";
}

function defaultDuration(assetKind: AssetKind) {
  return assetKind === "sound_effect" ? 5 : 30;
}

function clampDuration(
  value: number,
  assetKind: AssetKind,
  model: ModelOption | undefined,
) {
  const min = assetKind === "sound_effect" ? 0.5 : 5;
  const max = model?.maxDurationSeconds ?? 30;
  return Math.max(min, Math.min(value, max));
}

function firstAvailableProvider(
  providers: readonly ProviderOption[],
  assetKind: AssetKind,
  preferred?: ProviderKind,
) {
  return (
    providers.find(
      (item) =>
        item.provider === preferred && item.assetKinds.includes(assetKind),
    ) ??
    providers.find((item) => item.assetKinds.includes(assetKind)) ??
    null
  );
}

function firstModel(provider: ProviderOption | null, assetKind: AssetKind) {
  return provider?.models[assetKind]?.[0] ?? null;
}

export function GenerationWorkspace({
  initialDryRun,
  defaultProvider,
  providers,
}: GenerationWorkspaceProps) {
  const [assetKind, setAssetKind] = useState<AssetKind>("music");
  const initialProvider = firstAvailableProvider(
    providers,
    "music",
    defaultProvider,
  );
  const [provider, setProvider] = useState<ProviderKind | null>(
    initialProvider?.provider ?? null,
  );
  const [model, setModel] = useState<string>(
    firstModel(initialProvider, "music")?.id ?? "",
  );
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [instrumentalOnly, setInstrumentalOnly] = useState(true);
  const [tempoBpm, setTempoBpm] = useState("");
  const [genre, setGenre] = useState("");
  const [loop, setLoop] = useState(false);
  const [promptInfluence, setPromptInfluence] = useState(0.3);

  const [isGenerating, startGenerating] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const [result, setResult] = useState<ClientGenerationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedSubmission, setSavedSubmission] = useState<{
    submissionId: string;
    trackId: string;
  } | null>(null);
  const [workingTitle, setWorkingTitle] = useState("");

  const availableForMode = useMemo(
    () => providers.filter((item) => item.assetKinds.includes(assetKind)),
    [assetKind, providers],
  );
  const selectedProvider =
    availableForMode.find((item) => item.provider === provider) ?? null;
  const selectedModels = selectedProvider?.models[assetKind] ?? [];
  const selectedModel = selectedModels.find((item) => item.id === model);
  const effectiveDuration = clampDuration(
    durationSeconds,
    assetKind,
    selectedModel,
  );

  const changeAssetKind = (nextAssetKind: AssetKind) => {
    setAssetKind(nextAssetKind);
    const nextProvider = firstAvailableProvider(
      providers,
      nextAssetKind,
      provider ?? undefined,
    );
    const nextModel = firstModel(nextProvider, nextAssetKind);
    setProvider(nextProvider?.provider ?? null);
    setModel(nextModel?.id ?? "");
    setDurationSeconds(defaultDuration(nextAssetKind));
    setResult(null);
    setSavedSubmission(null);
    setError(null);
  };

  const changeProvider = (nextProvider: ProviderOption) => {
    const nextModel = firstModel(nextProvider, assetKind);
    setProvider(nextProvider.provider);
    setModel(nextModel?.id ?? "");
    setDurationSeconds((current) =>
      clampDuration(current, assetKind, nextModel ?? undefined),
    );
    setResult(null);
    setSavedSubmission(null);
    setError(null);
  };

  const handleGenerate = () => {
    if (!prompt.trim()) {
      setError(
        assetKind === "sound_effect"
          ? "Please provide a prompt describing the sound effect to generate."
          : "Please provide a prompt describing the music to generate.",
      );
      return;
    }
    if (!provider || !model) {
      setError("No configured generation provider is available for this mode.");
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
            assetKind,
            prompt: prompt.trim(),
            provider,
            model,
            durationSeconds: effectiveDuration,
            instrumentalOnly,
            tempoBpm: tempoBpm ? parseInt(tempoBpm, 10) : null,
            genre: genre.trim() || null,
            loop,
            promptInfluence,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to generate audio.");
        }

        const nextResult = data.data as ClientGenerationResponse;
        setResult(nextResult);
        setWorkingTitle(
          `${assetKind === "sound_effect" ? "AI SFX" : "AI Music"} — ${prompt
            .slice(0, 36)
            .trim()}`,
        );
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
        const response = await fetch("/api/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_draft",
            generationId: result.id,
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

  const disabled = isGenerating || !prompt.trim() || !provider || !model;

  return (
    <div className="mt-6 space-y-8">
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
              {initialDryRun ? "Dry-run simulation mode" : "Live provider mode"}
            </span>
          </div>
        </div>
        <Badge variant={initialDryRun ? "secondary" : "default"}>
          {initialDryRun ? "Dry Run (Zero Billing)" : "Live API Active"}
        </Badge>
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
        <section
          aria-labelledby="generation-form-heading"
          className="rounded-xl border border-border bg-surface p-6 sm:p-7 lg:col-span-7"
        >
          <h2
            id="generation-form-heading"
            className="text-lg font-semibold text-foreground"
          >
            Generate {labelForAssetKind(assetKind)}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Create internal audio drafts using only configured providers. Every
            output is stored privately and remains unpublished until it passes
            the normal SoundVault workflow.
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <label className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Asset Type
              </label>
              <div
                className="mt-2 grid grid-cols-2 gap-3"
                role="radiogroup"
                aria-label="Asset type"
              >
                {(["music", "sound_effect"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => changeAssetKind(kind)}
                    className={`flex flex-col items-start rounded-lg border p-3.5 text-left transition-colors ${
                      assetKind === kind
                        ? "border-brand bg-brand-soft/20 text-foreground"
                        : "border-border bg-background/50 text-muted-foreground hover:bg-muted"
                    }`}
                    role="radio"
                    aria-checked={assetKind === kind}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {labelForAssetKind(kind)}
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      {kind === "sound_effect"
                        ? "FX, stingers, ambience and loops"
                        : "Themes, beds, underscores and songs"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Configured Provider
              </label>
              {availableForMode.length > 0 ? (
                <div
                  className="mt-2 grid gap-3 sm:grid-cols-2"
                  role="radiogroup"
                  aria-label="Generation provider"
                >
                  {availableForMode.map((item) => (
                    <button
                      key={item.provider}
                      type="button"
                      onClick={() => changeProvider(item)}
                      className={`flex flex-col items-start rounded-lg border p-3.5 text-left transition-colors ${
                        provider === item.provider
                          ? "border-brand bg-brand-soft/20 text-foreground"
                          : "border-border bg-background/50 text-muted-foreground hover:bg-muted"
                      }`}
                      role="radio"
                      aria-checked={provider === item.provider}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        {item.label}
                        <Badge variant={item.live ? "default" : "outline"}>
                          {item.live ? "Configured" : "Local"}
                        </Badge>
                      </span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  No configured provider is available for this mode.
                </p>
              )}
            </div>

            {selectedModels.length > 0 ? (
              <div>
                <label
                  htmlFor="generation-model"
                  className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Model Variant
                </label>
                <select
                  id="generation-model"
                  value={model}
                  onChange={(event) => {
                    const nextModel = selectedModels.find(
                      (item) => item.id === event.target.value,
                    );
                    setModel(event.target.value);
                    setDurationSeconds((current) =>
                      clampDuration(current, assetKind, nextModel),
                    );
                    setResult(null);
                    setSavedSubmission(null);
                  }}
                  className="mt-2 h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                >
                  {selectedModels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} · up to {item.maxDurationSeconds}s
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

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
                onChange={(event) => setPrompt(event.target.value)}
                onInput={(event) => setPrompt(event.currentTarget.value)}
                placeholder={
                  assetKind === "sound_effect"
                    ? 'E.g., "Fast whoosh into a clean news stinger with a short sub hit."'
                    : 'E.g., "Urgent breaking news theme with driving percussion, tense strings, and bold brass fanfares."'
                }
                className="mt-2 w-full rounded-lg border border-input bg-surface p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>Try:</span>
              {(assetKind === "sound_effect"
                ? [
                    "Breaking news impact whoosh",
                    "Soft rain ambience loop",
                    "Clean notification sparkle",
                  ]
                : [
                    "Diwali Dhol Celebration",
                    "Investigative Documentary",
                    "Corporate Acoustic",
                  ]
              ).map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                  className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                >
                  {example}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="duration-seconds"
                  className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Duration ({effectiveDuration}s)
                </label>
                <input
                  id="duration-seconds"
                  type="range"
                  min={assetKind === "sound_effect" ? "0.5" : "5"}
                  max={String(selectedModel?.maxDurationSeconds ?? 30)}
                  step={assetKind === "sound_effect" ? "0.5" : "5"}
                  value={effectiveDuration}
                  onChange={(event) =>
                    setDurationSeconds(Number(event.target.value))
                  }
                  className="mt-3 w-full accent-brand"
                />
              </div>

              {assetKind === "music" ? (
                <>
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
                      onChange={(event) => setTempoBpm(event.target.value)}
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
                      onChange={(event) => setGenre(event.target.value)}
                      className="mt-2 h-10"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="prompt-influence"
                      className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      Prompt Influence ({promptInfluence.toFixed(1)})
                    </label>
                    <input
                      id="prompt-influence"
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={promptInfluence}
                      onChange={(event) =>
                        setPromptInfluence(Number(event.target.value))
                      }
                      className="mt-3 w-full accent-brand"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-7">
                    <input
                      id="loopable-effect"
                      type="checkbox"
                      checked={loop}
                      onChange={(event) => setLoop(event.target.checked)}
                      className="size-4 rounded border-border text-brand focus:ring-brand"
                    />
                    <label
                      htmlFor="loopable-effect"
                      className="text-sm font-medium text-foreground"
                    >
                      Loopable sound
                    </label>
                  </div>
                </>
              )}
            </div>

            {assetKind === "music" ? (
              <div className="flex items-center gap-3 pt-1">
                <input
                  id="instrumental-only"
                  type="checkbox"
                  checked={instrumentalOnly}
                  onChange={(event) =>
                    setInstrumentalOnly(event.target.checked)
                  }
                  className="size-4 rounded border-border text-brand focus:ring-brand"
                />
                <label
                  htmlFor="instrumental-only"
                  className="text-sm font-medium text-foreground"
                >
                  Force instrumental (strictly no vocals)
                </label>
              </div>
            ) : null}

            <div className="pt-2">
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={disabled}
                className="h-11 w-full gap-2 text-sm font-semibold"
              >
                {isGenerating ? (
                  <>
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                    Generating audio…
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
            Audition generated audio and commit only the server-owned provenance
            record as a draft.
          </p>

          {result ? (
            <div className="mt-6 flex-1 space-y-6">
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
                  <Badge
                    variant={result.isSimulated ? "outline" : "secondary"}
                    className="text-[11px]"
                  >
                    {result.isSimulated ? "Simulated" : "Live Output"}
                  </Badge>
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
                    <dt className="text-muted-foreground">Asset type</dt>
                    <dd className="font-medium text-foreground">
                      {labelForAssetKind(result.assetKind)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Provider</dt>
                    <dd className="font-medium text-foreground">
                      {selectedProvider?.label ?? result.provider}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Model</dt>
                    <dd className="font-mono font-medium text-foreground">
                      {result.model}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-medium text-foreground">
                      Private generated record stored
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
                    Generated audio has been copied from the trusted private
                    generation record into an unpublished draft submission.
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
                    Enters the existing SoundVault workflow. It never bypasses
                    technical processing, copyright checks, review or
                    publishing.
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
                      onChange={(event) => setWorkingTitle(event.target.value)}
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
                Choose music or sound effects, enter a prompt, then generate an
                audio preview.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
