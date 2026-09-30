"use client";

import { cn } from "@/lib/utils";

export function TimerRing({
  remainingMs,
  totalMs,
  paused,
  size = 120,
  className,
}: {
  remainingMs: number;
  totalMs: number;
  paused?: boolean;
  size?: number;
  className?: string;
}) {
  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const urgent = seconds <= 5 && remainingMs > 0;
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={paused ? `Paused with ${seconds} seconds left` : `${seconds} seconds left`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="white" stroke="#FBE9EC" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={urgent ? "#D22F3A" : paused ? "#8D6E95" : "#E991A0"}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 120ms linear, stroke 300ms" }}
        />
      </svg>
      <span
        className={cn(
          "relative font-serif font-bold tabular-nums",
          urgent ? "text-error" : "text-plum-dark",
          paused && "animate-pulse-soft",
        )}
        style={{ fontSize: size * 0.34 }}
      >
        {paused ? "II" : seconds}
      </span>
    </div>
  );
}

export function TimerBar({ remainingMs, totalMs, paused }: { remainingMs: number; totalMs: number; paused?: boolean }) {
  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`${seconds} seconds left`}>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-blush">
        <div
          className={cn("h-full rounded-full", seconds <= 5 ? "bg-error" : paused ? "bg-lavender" : "bg-sakura")}
          style={{ width: `${fraction * 100}%`, transition: "width 120ms linear" }}
        />
      </div>
      <span className="w-10 text-right font-serif text-xl font-bold tabular-nums text-plum-dark">{paused ? "II" : seconds}</span>
    </div>
  );
}
