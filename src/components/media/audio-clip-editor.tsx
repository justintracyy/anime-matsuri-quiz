"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

async function computePeaks(url: string, buckets = 240): Promise<number[]> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audio = await ctx.decodeAudioData(buffer);
    const data = audio.getChannelData(0);
    const size = Math.floor(data.length / buckets) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < buckets; i++) {
      let max = 0;
      for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j += 16) max = Math.max(max, Math.abs(data[j]));
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.01);
    return peaks.map((p) => p / top);
  } finally {
    void ctx.close();
  }
}

/** Start/end selection with a lightweight waveform (falls back to sliders only). */
export function AudioClipEditor({
  url,
  start,
  duration,
  allowReplay,
  onChange,
}: {
  url: string;
  start: number;
  duration: number | null;
  allowReplay: boolean;
  onChange: (value: { start: number; duration: number | null; allowReplay: boolean }) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [total, setTotal] = useState(0);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const end = duration ? Math.min(total || start + duration, start + duration) : total;

  useEffect(() => {
    let cancelled = false;
    computePeaks(url)
      .then((p) => !cancelled && setPeaks(p))
      .catch(() => !cancelled && setPeaks(null));
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || !total) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * dpr;
    const height = canvas.clientHeight * dpr;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const barW = width / peaks.length;
    peaks.forEach((p, i) => {
      const t = (i / peaks.length) * total;
      ctx.fillStyle = t >= start && t <= end ? "#E991A0" : "#ECC9CF";
      const h = Math.max(2 * dpr, p * height * 0.9);
      ctx.fillRect(i * barW, (height - h) / 2, Math.max(1, barW - dpr), h);
    });
    if (playing) {
      ctx.fillStyle = "#4B3D4F";
      ctx.fillRect((position / total) * width, 0, 2 * dpr, height);
    }
  }, [peaks, total, start, end, playing, position]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    el.currentTime = start;
    await el.play().catch(() => undefined);
  };

  return (
    <div className="space-y-3 rounded-2xl border-2 border-dusty-pink bg-white p-4">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => setTotal(e.currentTarget.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          setPosition(e.currentTarget.currentTime);
          if (e.currentTarget.currentTime >= end) e.currentTarget.pause();
        }}
      />
      {peaks && <canvas ref={canvasRef} className="h-16 w-full" aria-hidden="true" />}
      {total > 0 ? (
        <>
          <Slider
            value={[start, end]}
            min={0}
            max={total}
            step={0.1}
            minStepsBetweenThumbs={5}
            thumbLabels={["Clip start", "Clip end"]}
            onValueChange={([s, e]) => onChange({ start: Math.round(s * 10) / 10, duration: Math.round((e - s) * 10) / 10, allowReplay })}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-plum-dark">
              Start {formatTime(start)} · End {formatTime(end)} · <span className="text-sakura">{(end - start).toFixed(1)}s clip</span>
            </span>
            <span className="text-xs text-muted-text">Full track {formatTime(total)}</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-text">Loading audio…</p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" size="sm" variant="sakura" onClick={() => void togglePlay()} disabled={!total}>
          {playing ? <Pause /> : <Play />} {playing ? "Stop" : "Preview clip"}
        </Button>
        <div className="flex items-center gap-2">
          <Switch id="replay" checked={allowReplay} onCheckedChange={(v) => onChange({ start, duration, allowReplay: v })} />
          <Label htmlFor="replay">Allow the host to replay the clip</Label>
        </div>
      </div>
    </div>
  );
}
