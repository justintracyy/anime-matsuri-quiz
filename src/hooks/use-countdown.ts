"use client";

import { useEffect, useState } from "react";
import { serverNow } from "@/lib/api/client";

interface CountdownInput {
  endsAt: string | null;
  paused: boolean;
  pausedRemainingMs: number | null;
  enabled: boolean;
}

function remainingFor({ endsAt, paused, pausedRemainingMs, enabled }: CountdownInput): number {
  if (!enabled || !endsAt) return 0;
  if (paused) return Math.max(0, pausedRemainingMs ?? 0);
  return Math.max(0, Date.parse(endsAt) - serverNow());
}

/**
 * Remaining time for the current question, computed from the server's
 * question_ends_at and the device's measured clock offset — never from a local
 * timer — so every screen agrees within a few milliseconds.
 */
export function useCountdown(input: CountdownInput): number {
  const { endsAt, paused, pausedRemainingMs, enabled } = input;
  const key = `${enabled}|${endsAt}|${paused}|${pausedRemainingMs}`;
  const [state, setState] = useState(() => ({ key, remaining: remainingFor(input) }));

  useEffect(() => {
    const current = { endsAt, paused, pausedRemainingMs, enabled };
    const tick = () => setState({ key, remaining: remainingFor(current) });
    tick();
    if (!enabled || paused || !endsAt) return;
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [key, endsAt, paused, pausedRemainingMs, enabled]);

  // Until the effect catches up, a stale value from the previous question (often 0) must not leak out.
  return state.key === key ? state.remaining : remainingFor(input);
}
