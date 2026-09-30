"use client";

import { useEffect, useState } from "react";
import { serverNow } from "@/lib/api/client";

/**
 * Remaining time for the current question, computed from the server's
 * question_ends_at and the device's measured clock offset — never from a local
 * timer — so every screen agrees within a few milliseconds.
 */
export function useCountdown({
  endsAt,
  paused,
  pausedRemainingMs,
  enabled,
}: {
  endsAt: string | null;
  paused: boolean;
  pausedRemainingMs: number | null;
  enabled: boolean;
}): number {
  const compute = () => {
    if (!enabled || !endsAt) return 0;
    if (paused) return Math.max(0, pausedRemainingMs ?? 0);
    return Math.max(0, Date.parse(endsAt) - serverNow());
  };
  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    const tick = () => {
      if (!enabled || !endsAt) return setRemaining(0);
      if (paused) return setRemaining(Math.max(0, pausedRemainingMs ?? 0));
      setRemaining(Math.max(0, Date.parse(endsAt) - serverNow()));
    };
    tick();
    if (!enabled || paused || !endsAt) return;
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [endsAt, paused, pausedRemainingMs, enabled]);

  return remaining;
}
