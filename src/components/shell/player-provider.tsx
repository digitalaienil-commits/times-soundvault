"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  ListMusic,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type {
  PlaybackDescriptor,
  PlayerQueueItem,
  PlaybackSourceDescriptor,
} from "@/types/media";

interface PlayerContextValue {
  descriptor: PlaybackDescriptor | null;
  source: PlaybackSourceDescriptor | null;
  playing: boolean;
  loading: boolean;
  error: string | null;
  playTrack(
    trackId: string,
    queue?: PlayerQueueItem[],
    audioAssetId?: string,
  ): Promise<void>;
  selectSource(source: PlaybackSourceDescriptor): Promise<void>;
  togglePlayback(): void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function useSoundVaultPlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("Player controls require the workspace player");
  return value;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [descriptor, setDescriptor] = useState<PlaybackDescriptor | null>(null);
  const [source, setSource] = useState<PlaybackSourceDescriptor | null>(null);
  const [queue, setQueue] = useState<PlayerQueueItem[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectSource = useCallback(async (next: PlaybackSourceDescriptor) => {
    if (!next.ready || !next.streamUrl) {
      setError("This preview is still being prepared.");
      return;
    }
    setSource(next);
    setError(null);
    const audio = audioRef.current;
    if (audio) {
      audio.src = next.streamUrl;
      audio.load();
      await audio.play().catch(() => {
        setError("Playback could not start. Try the play button again.");
      });
    }
  }, []);

  const playTrack = useCallback(
    async (
      trackId: string,
      nextQueue?: PlayerQueueItem[],
      audioAssetId?: string,
    ) => {
      setLoading(true);
      setError(null);
      if (nextQueue?.length) setQueue(nextQueue);
      if (document.activeElement instanceof HTMLElement)
        returnFocusRef.current = document.activeElement;
      try {
        const response = await fetch(
          `/api/library/tracks/${trackId}/playback`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Published playback is unavailable.");
        const next = (await response.json()) as PlaybackDescriptor;
        setDescriptor(next);
        const selected = audioAssetId
          ? next.sources.find((item) => item.audioAssetId === audioAssetId)
          : next.sources.find((item) => item.kind === "master");
        if (!selected?.ready) {
          setSource(selected ?? null);
          setError("This preview is still being prepared.");
          return;
        }
        await selectSource(selected);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Playback is unavailable.",
        );
      } finally {
        setLoading(false);
      }
    },
    [selectSource],
  );

  const move = useCallback(
    async (direction: -1 | 1) => {
      if (!descriptor) return;
      const index = queue.findIndex(
        (item) => item.trackId === descriptor.trackId,
      );
      const next = queue[index + direction];
      if (next) await playTrack(next.trackId);
    },
    [descriptor, playTrack, queue],
  );

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio
        .play()
        .catch(() => setError("Playback could not start. Try again."));
    } else audio.pause();
  }, []);

  const context = useMemo(
    () => ({
      descriptor,
      source,
      playing,
      loading,
      error,
      playTrack,
      selectSource,
      togglePlayback,
    }),
    [
      descriptor,
      source,
      playing,
      loading,
      error,
      playTrack,
      selectSource,
      togglePlayback,
    ],
  );

  return (
    <PlayerContext.Provider value={context}>
      {children}
      <PersistentPlayer
        audioRef={audioRef}
        descriptor={descriptor}
        source={source}
        playing={playing}
        queue={queue}
        error={error}
        onPlayingChange={setPlaying}
        onPlaybackError={setError}
        onToggle={togglePlayback}
        onPrevious={() => void move(-1)}
        onNext={() => void move(1)}
        onSelectQueueItem={(trackId) => void playTrack(trackId)}
        onClose={() => {
          audioRef.current?.pause();
          setDescriptor(null);
          setSource(null);
          setQueue([]);
          setError(null);
          setPlaying(false);
          window.requestAnimationFrame(() => returnFocusRef.current?.focus());
        }}
      />
    </PlayerContext.Provider>
  );
}

function PersistentPlayer({
  audioRef,
  descriptor,
  source,
  playing,
  queue,
  error,
  onPlayingChange,
  onPlaybackError,
  onToggle,
  onPrevious,
  onNext,
  onSelectQueueItem,
  onClose,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  descriptor: PlaybackDescriptor | null;
  source: PlaybackSourceDescriptor | null;
  playing: boolean;
  queue: PlayerQueueItem[];
  error: string | null;
  onPlayingChange(playing: boolean): void;
  onPlaybackError(message: string): void;
  onToggle(): void;
  onPrevious(): void;
  onNext(): void;
  onSelectQueueItem(trackId: string): void;
  onClose(): void;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("soundvault-player-muted") === "true",
  );
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 1;
    const stored = Number(
      localStorage.getItem("soundvault-player-volume") ?? "1",
    );
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 1;
  });
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
      audioRef.current.volume = volume;
    }
  }, [audioRef, muted, volume]);

  const queueIndex = descriptor
    ? queue.findIndex((item) => item.trackId === descriptor.trackId)
    : -1;
  const hasPrevious = queueIndex > 0;
  const hasNext = queueIndex >= 0 && queueIndex < queue.length - 1;
  return (
    <>
      <audio
        className="hidden"
        ref={audioRef}
        preload="metadata"
        onPlay={() => {
          onPlayingChange(true);
          setNotice(null);
        }}
        onPlaying={() => setNotice(null)}
        onPause={() => onPlayingChange(false)}
        onWaiting={() => setNotice("Playback is buffering…")}
        onStalled={() => setNotice("Playback is waiting for audio data…")}
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onEnded={onNext}
        onError={() => {
          onPlayingChange(false);
          onPlaybackError("Playback is unavailable for this Track.");
        }}
      />
      {descriptor ? (
        <section
          aria-label="SoundVault player"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-2xl backdrop-blur"
        >
          <div className="mx-auto max-w-[100rem] px-4 py-3 sm:px-6 lg:px-10">
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous track"
                disabled={!hasPrevious}
                onClick={onPrevious}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                aria-label={
                  playing
                    ? `Pause ${descriptor.title}`
                    : `Play ${descriptor.title}`
                }
                onClick={onToggle}
              >
                {playing ? (
                  <Pause aria-hidden="true" />
                ) : (
                  <Play aria-hidden="true" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next track"
                disabled={!hasNext}
                onClick={onNext}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
              <div className="order-first min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
                <div className="flex items-baseline justify-between gap-3">
                  <p
                    aria-live="polite"
                    className="truncate text-sm font-semibold text-foreground"
                  >
                    {descriptor.title} · {source?.label ?? "Master"}
                  </p>
                  <span
                    aria-label={`Elapsed ${formatTime(currentTime)} of ${formatTime(duration)}`}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
                <label className="relative mt-1 block h-9">
                  <span className="sr-only">
                    Seek through {descriptor.title}
                  </span>
                  <Waveform peaks={source?.waveformPeaks ?? null} />
                  <input
                    type="range"
                    min={0}
                    max={Math.max(duration, 0)}
                    step={0.1}
                    value={Math.min(currentTime, duration || 0)}
                    aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
                    onChange={(event) => {
                      const time = Number(event.currentTarget.value);
                      if (audioRef.current) audioRef.current.currentTime = time;
                      setCurrentTime(time);
                    }}
                    className="relative z-10 h-9 w-full cursor-pointer accent-brand"
                  />
                </label>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  if (audioRef.current) audioRef.current.muted = next;
                  localStorage.setItem("soundvault-player-muted", String(next));
                }}
              >
                {muted ? (
                  <VolumeX aria-hidden="true" />
                ) : (
                  <Volume2 aria-hidden="true" />
                )}
              </Button>
              <label className="hidden w-24 sm:block">
                <span className="sr-only">Volume</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value);
                    setVolume(next);
                    if (audioRef.current) audioRef.current.volume = next;
                    localStorage.setItem(
                      "soundvault-player-volume",
                      String(next),
                    );
                  }}
                  className="w-full accent-brand"
                />
              </label>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Show queue"
                aria-expanded={queueOpen}
                aria-controls="soundvault-player-queue"
                onClick={() => setQueueOpen((open) => !open)}
              >
                <ListMusic aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close player"
                onClick={onClose}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            {error ? (
              <p role="status" className="mt-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="mt-2 text-xs text-muted-foreground">
                {notice}
              </p>
            ) : null}
            {queueOpen ? (
              <section
                id="soundvault-player-queue"
                aria-label="Player queue"
                className="mt-3 rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-foreground">
                    Current page queue
                  </p>
                  <Link
                    href={`/library/${descriptor.trackId}`}
                    className="text-xs font-semibold text-brand underline-offset-4 hover:underline"
                  >
                    Open Track detail
                  </Link>
                </div>
                <ol className="mt-2 space-y-1">
                  {queue.map((item, index) => (
                    <li
                      key={item.trackId}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="min-w-0 truncate text-muted-foreground">
                        {index === queueIndex
                          ? "Current · "
                          : index < queueIndex
                            ? "Previous · "
                            : "Up next · "}
                        {item.title}
                        {item.versionLabel ? ` · ${item.versionLabel}` : ""}
                        {item.durationMs !== null
                          ? ` · ${formatTime(item.durationMs / 1000)}`
                          : ""}
                      </span>
                      {index !== queueIndex ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Play ${item.title}`}
                          onClick={() => onSelectQueueItem(item.trackId)}
                        >
                          Play
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Waveform({ peaks }: { peaks: number[] | null }) {
  if (!peaks?.length) {
    return (
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-px bg-border"
      />
    );
  }
  const lineCount = 96;
  const step = Math.max(1, Math.floor(peaks.length / 2 / lineCount));
  const lines = Array.from({ length: lineCount }, (_, index) => {
    const peakIndex = Math.min(peaks.length / 2 - 1, index * step) * 2;
    const magnitude = Math.max(
      Math.abs(peaks[peakIndex] ?? 0),
      Math.abs(peaks[peakIndex + 1] ?? 0),
    );
    return Math.max(2, Math.round((magnitude / 32768) * 30));
  });
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 96 32"
      preserveAspectRatio="none"
      className="absolute inset-0 h-8 w-full text-brand/35"
    >
      {lines.map((height, index) => (
        <line
          key={index}
          x1={index + 0.5}
          x2={index + 0.5}
          y1={(32 - height) / 2}
          y2={(32 + height) / 2}
          stroke="currentColor"
          strokeWidth="0.7"
        />
      ))}
    </svg>
  );
}
