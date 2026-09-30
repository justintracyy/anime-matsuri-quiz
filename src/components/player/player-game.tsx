"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConnectionBanner, LiveDot } from "@/components/game/connection-banner";
import { FullPageSpinner, MessageScreen } from "@/components/states";
import { useCountdown } from "@/hooks/use-countdown";
import { useRealtimeTables } from "@/hooks/use-realtime";
import { ApiError, apiFetch } from "@/lib/api/client";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/constants";
import type { PlayerView } from "@/lib/game/types";
import { clearPlayer, loadPlayer, playerHeaders, type StoredPlayer } from "@/lib/player-session";
import { formatPoints, sleep } from "@/lib/utils";
import { PlayerScreens } from "./player-screens";

export interface LocalAnswer {
  questionId: string;
  choiceId: string;
  status: "sending" | "sent" | "rejected";
  message?: string;
}

export function PlayerGame({ pin }: { pin: string }) {
  const router = useRouter();
  const [creds] = useState<StoredPlayer | null>(() => loadPlayer(pin));
  const [view, setView] = useState<PlayerView | null>(null);
  const [fatal, setFatal] = useState<ApiError | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [localAnswer, setLocalAnswer] = useState<LocalAnswer | null>(null);
  const viewRef = useRef<PlayerView | null>(null);
  const requestSeq = useRef(0);
  const refreshTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!creds) return;
    const seq = ++requestSeq.current;
    try {
      const next = await apiFetch<PlayerView>("/api/play/state", { headers: playerHeaders(creds) });
      // Ignore out-of-order responses.
      if (seq < requestSeq.current && viewRef.current && next.session.stateVersion < viewRef.current.session.stateVersion) return;
      viewRef.current = next;
      setView(next);
      setNetworkError(null);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("INTERNAL", "Something went wrong.", 500);
      if (err.isNetwork) setNetworkError(err.message);
      else if (err.code === "UNAUTHORIZED") {
        clearPlayer(pin);
        router.replace(`/join/${pin}?reason=session`);
      } else if (err.status >= 500) setNetworkError("The game server had a hiccup. Retrying…");
      else setFatal(err);
    }
  }, [creds, pin, router]);

  /** Coalesce bursts of realtime events; small jitter spreads 50 phones' requests. */
  const scheduleRefresh = useCallback(
    (delay = 0) => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void refresh(), delay);
    },
    [refresh],
  );

  useEffect(() => {
    if (!creds) {
      router.replace(`/join/${pin}`);
      return;
    }
    scheduleRefresh(0);
  }, [creds, pin, router, scheduleRefresh]);

  const realtime = useRealtimeTables(
    creds ? `player:${creds.sessionId}:${creds.playerId}` : null,
    creds
      ? [
          { table: "game_sessions", filter: `id=eq.${creds.sessionId}` },
          { table: "players", filter: `id=eq.${creds.playerId}` },
        ]
      : [],
    (table, payload) => {
      const row = payload.new as Record<string, unknown>;
      const current = viewRef.current;
      if (table === "game_sessions") {
        if (!current || row.state_version !== current.session.stateVersion) scheduleRefresh(Math.random() * 250);
      } else if (!current || row.kicked !== current.me.kicked || row.score !== current.me.score || row.streak !== current.me.streak) {
        scheduleRefresh(100);
      }
    },
  );

  // Catch up after reconnecting.
  const prevRealtime = useRef(realtime);
  useEffect(() => {
    if (prevRealtime.current !== "live" && realtime === "live") scheduleRefresh(0);
    prevRealtime.current = realtime;
  }, [realtime, scheduleRefresh]);

  // Heartbeat (connection status) + fallback polling when realtime is down.
  useEffect(() => {
    if (!creds) return;
    const beat = async (connected = true) => {
      try {
        const res = await apiFetch<{ stateVersion: number; kicked: boolean }>("/api/play/heartbeat", {
          method: "POST",
          json: { playerId: creds.playerId, token: creds.token, connected },
        });
        const current = viewRef.current;
        if (!current || res.stateVersion !== current.session.stateVersion || res.kicked !== current.me.kicked) scheduleRefresh(0);
      } catch {
        // surfaced by refresh()
      }
    };
    void beat();
    const heartbeat = window.setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
    const poll = window.setInterval(() => {
      if (realtime !== "live") void refresh();
    }, 4000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void beat();
        scheduleRefresh(0);
      }
    };
    const onHide = () => {
      navigator.sendBeacon?.("/api/play/heartbeat", JSON.stringify({ playerId: creds.playerId, token: creds.token, connected: false }));
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("online", onVisible);
    };
  }, [creds, realtime, refresh, scheduleRefresh]);

  const phase = view?.session.phase;
  const remainingMs = useCountdown({
    endsAt: view?.session.questionEndsAt ?? null,
    paused: phase === "paused",
    pausedRemainingMs: view?.session.pausedRemainingMs ?? null,
    enabled: phase === "active" || phase === "paused",
  });

  // When the local clock says time is up, fetch the closed state.
  useEffect(() => {
    if (phase === "active" && remainingMs === 0) scheduleRefresh(400);
  }, [phase, remainingMs, scheduleRefresh]);

  const submitAnswer = useCallback(
    async (choiceId: string) => {
      const current = viewRef.current;
      if (!creds || !current?.question) return;
      const questionId = current.question.id;
      if (current.myAnswer || (localAnswer && localAnswer.questionId === questionId && localAnswer.status !== "rejected")) return;
      setLocalAnswer({ questionId, choiceId, status: "sending" });
      if (navigator.vibrate) navigator.vibrate(30);

      // Retries are safe: the database accepts only one answer per player per question.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await apiFetch<{ choiceId: string | null; duplicate: boolean }>("/api/play/answer", {
            method: "POST",
            headers: playerHeaders(creds),
            json: { questionId, choiceId },
          });
          setLocalAnswer({ questionId, choiceId: res.choiceId ?? choiceId, status: "sent" });
          scheduleRefresh(300);
          return;
        } catch (e) {
          const err = e instanceof ApiError ? e : new ApiError("INTERNAL", "Something went wrong.", 500);
          if (err.isNetwork || err.status >= 500) {
            setNetworkError("Sending your answer… hold on.");
            await sleep(500 * 2 ** attempt);
            continue;
          }
          if (err.code === "PAUSED") {
            setLocalAnswer(null);
            toast.info(err.message);
          } else {
            setLocalAnswer({ questionId, choiceId, status: "rejected", message: err.message });
            if (err.code !== "TIME_UP") toast.error(err.message);
          }
          scheduleRefresh(0);
          return;
        }
      }
      setLocalAnswer({ questionId, choiceId, status: "rejected", message: "Your answer could not be sent. Check your connection." });
      setNetworkError(null);
      scheduleRefresh(0);
    },
    [creds, localAnswer, scheduleRefresh],
  );

  if (!creds) return <FullPageSpinner label="Taking you to the join page…" />;
  if (fatal) {
    return (
      <MessageScreen
        title={fatal.code === "NOT_FOUND" ? "Game not found" : "Something went wrong"}
        message={fatal.message}
        action={{ label: "Back to join", onClick: () => { clearPlayer(pin); router.replace(`/join/${pin}`); } }}
        mood="wow"
      />
    );
  }
  if (!view) return <FullPageSpinner label="Connecting to the game…" />;
  if (view.me.kicked) {
    return <MessageScreen title="You were removed" message="The host removed you from this game." action={{ label: "Back home", href: "/" }} mood="wow" />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <ConnectionBanner realtime={realtime} networkError={networkError} onRetry={() => scheduleRefresh(0)} />
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b-2 border-dusty-pink bg-white/90 px-4 py-2.5 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate font-bold text-plum-dark">{view.me.nickname}</p>
          <LiveDot status={realtime === "unavailable" ? "offline" : realtime} />
        </div>
        <div className="text-right">
          <p className="font-serif text-xl font-bold tabular-nums text-plum">{formatPoints(view.me.score)}</p>
          <p className="text-xs text-muted-text">{view.me.rank ? `Rank ${view.me.rank} of ${view.me.playerCount}` : "points"}</p>
        </div>
      </header>
      <PlayerScreens view={view} remainingMs={remainingMs} localAnswer={localAnswer} onAnswer={submitAnswer} />
    </div>
  );
}
