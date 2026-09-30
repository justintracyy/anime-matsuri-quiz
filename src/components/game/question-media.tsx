"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ImageOff, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spirit } from "@/components/brand/decorations";
import type { QuestionView } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function QuestionImage({
  image,
  alt,
  className,
  expectImage,
}: {
  image: QuestionView["image"];
  alt: string;
  className?: string;
  expectImage?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = image?.url ?? null;
  const failed = !!url && failedUrl === url;

  if (!url || failed) {
    if (!expectImage && !image) return null;
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-dusty-pink bg-blush/50 p-6 text-center text-muted-text",
          className,
        )}
        role="img"
        aria-label="Image unavailable"
      >
        <ImageOff className="size-8" />
        <p className="font-semibold">Image unavailable</p>
        <p className="text-xs">The question can still be played using the prompt and choices.</p>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs with arbitrary dimensions
    <img
      src={url}
      alt={alt}
      onError={() => setFailedUrl(url)}
      className={cn("mx-auto max-h-full w-auto rounded-2xl object-contain", className)}
      draggable={false}
    />
  );
}

/**
 * Plays [start, start + duration) of the audio file. Autoplays when `autoPlay`
 * is set (after the host pressed Start, so the browser allows playback).
 */
export function AudioClipPlayer({
  audio,
  autoPlay,
  stopSignal,
  compact,
}: {
  audio: NonNullable<QuestionView["audio"]>;
  autoPlay?: boolean;
  /** Changes to this value stop playback (e.g. the question closed). */
  stopSignal?: unknown;
  compact?: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [plays, setPlays] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const start = audio.startSeconds ?? 0;
  const duration = audio.durationSeconds;
  const failed = !!audio.url && failedUrl === audio.url;

  const play = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    try {
      el.currentTime = start;
      await el.play();
      setBlocked(false);
      setPlays((n) => n + 1);
    } catch {
      setBlocked(true);
    }
  }, [start]);

  useEffect(() => {
    if (!autoPlay || !audio.url) return;
    const id = window.setTimeout(() => void play(), 250);
    return () => window.clearTimeout(id);
  }, [autoPlay, audio.url, play]);

  useEffect(() => {
    ref.current?.pause();
  }, [stopSignal]);

  const onTimeUpdate = () => {
    const el = ref.current;
    if (!el) return;
    const end = duration ? start + duration : el.duration || start;
    const span = Math.max(0.01, end - start);
    setProgress(Math.min(1, Math.max(0, (el.currentTime - start) / span)));
    if (duration && el.currentTime >= start + duration) {
      el.pause();
      setProgress(1);
    }
  };

  if (!audio.url || failed) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-dusty-pink bg-blush/50 p-4 text-muted-text" role="status">
        <AlertTriangle className="size-6 shrink-0 text-gold" />
        <div>
          <p className="font-semibold text-plum-dark">Audio unavailable</p>
          <p className="text-xs">The clip could not be loaded. The host can read the prompt or skip this question.</p>
        </div>
      </div>
    );
  }

  const canReplay = audio.allowReplay || plays === 0;
  return (
    <div className={cn("flex items-center gap-4 rounded-2xl border-2 border-dusty-pink bg-white p-4 shadow-[var(--shadow-soft)]", compact && "p-3")}>
      <audio
        ref={ref}
        src={audio.url}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onError={() => setFailedUrl(audio.url ?? null)}
      />
      <div className={cn("relative flex shrink-0 items-center justify-center", compact ? "size-12" : "size-20")}>
        <Spirit className={cn("absolute inset-0", playing && "animate-spirit-float")} mood={playing ? "wow" : "happy"} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold text-plum-dark">
          <Volume2 className="size-4 text-sakura" />
          {playing ? "Listen closely…" : blocked ? "Tap play to start the clip" : plays > 0 ? "Clip finished" : "Audio clip"}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-blush">
          <div className="h-full rounded-full bg-sakura transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      {playing ? (
        <Button size="icon" variant="outline" onClick={() => ref.current?.pause()} aria-label="Pause clip">
          <Pause />
        </Button>
      ) : (
        <Button size="icon" variant="sakura" onClick={() => void play()} disabled={!canReplay} aria-label={plays > 0 ? "Replay clip" : "Play clip"}>
          {plays > 0 ? <RotateCcw /> : <Play />}
        </Button>
      )}
    </div>
  );
}
