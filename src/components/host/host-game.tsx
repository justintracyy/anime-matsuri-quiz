"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConnectionBanner } from "@/components/game/connection-banner";
import { MessageScreen, FullPageSpinner } from "@/components/states";
import { useCountdown } from "@/hooks/use-countdown";
import { useRealtimeTables } from "@/hooks/use-realtime";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { HostAction } from "@/lib/game/service";
import type { HostView } from "@/lib/game/types";
import { HostStage } from "./host-stage";

export type RunAction = (action: HostAction, extra?: { playerId?: string; settings?: { allowLateJoin?: boolean; mirrorToPlayers?: boolean } }) => Promise<void>;

export function HostGame({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [view, setView] = useState<HostView | null>(null);
  const [fatal, setFatal] = useState<ApiError | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [busy, setBusy] = useState<HostAction | null>(null);
  const [liveCount, setLiveCount] = useState<{ questionId: string; count: number } | null>(null);
  const viewRef = useRef<HostView | null>(null);
  const playersTimer = useRef<number | null>(null);

  const apply = useCallback((next: HostView) => {
    const current = viewRef.current;
    if (current && next.session.id === current.session.id && next.session.stateVersion < current.session.stateVersion) return;
    viewRef.current = next;
    setView(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await apiFetch<HostView>(`/api/admin/sessions/${sessionId}`));
      setNetworkError(null);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("INTERNAL", "Something went wrong.", 500);
      if (err.isNetwork || err.status >= 500) setNetworkError(err.isNetwork ? err.message : "The server had a hiccup. Retrying…");
      else if (err.code === "UNAUTHORIZED") router.replace(`/login?next=/host/${sessionId}`);
      else setFatal(err);
    }
  }, [apply, router, sessionId]);

  useEffect(() => {
    const id = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  const realtime = useRealtimeTables(
    `host:${sessionId}`,
    [
      { table: "game_sessions", filter: `id=eq.${sessionId}` },
      { table: "players", filter: `game_session_id=eq.${sessionId}` },
      { table: "question_progress", filter: `game_session_id=eq.${sessionId}` },
    ],
    (table, payload) => {
      const row = payload.new as Record<string, unknown>;
      if (table === "game_sessions") {
        if (row.state_version !== viewRef.current?.session.stateVersion) void refresh();
      } else if (table === "players") {
        // Coalesce bursts (e.g. 50 players joining at once).
        if (playersTimer.current) window.clearTimeout(playersTimer.current);
        playersTimer.current = window.setTimeout(() => void refresh(), 400);
      } else if (typeof row.question_id === "string" && typeof row.answer_count === "number") {
        setLiveCount({ questionId: row.question_id, count: row.answer_count });
      }
    },
  );

  const prevRealtime = useRef(realtime);
  useEffect(() => {
    if (prevRealtime.current !== "live" && realtime === "live") void refresh();
    prevRealtime.current = realtime;
  }, [realtime, refresh]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), realtime === "live" ? 10_000 : 3000);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [realtime, refresh]);

  const run: RunAction = useCallback(
    async (action, extra = {}) => {
      const current = viewRef.current;
      if (!current) return;
      setBusy(action);
      try {
        const next = await apiFetch<HostView>(`/api/admin/sessions/${sessionId}/actions`, {
          method: "POST",
          json: { action, expectedVersion: current.session.stateVersion, ...extra },
        });
        viewRef.current = next;
        setView(next);
        setNetworkError(null);
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("INTERNAL", "Something went wrong.", 500);
        if (err.code === "VERSION_CONFLICT") {
          // The server may have closed the question itself when the last player answered.
          if (action !== "end_question") toast.info("The game was updated elsewhere — showing the latest state.");
        } else if (err.isNetwork) {
          setNetworkError(err.message);
        } else if (!(action === "end_question" && err.code === "INVALID_PHASE")) {
          toast.error(err.message);
        }
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh, sessionId],
  );

  const phase = view?.session.phase;
  const remainingMs = useCountdown({
    endsAt: view?.session.questionEndsAt ?? null,
    paused: phase === "paused",
    pausedRemainingMs: view?.session.pausedRemainingMs ?? null,
    enabled: phase === "active" || phase === "paused",
  });

  // Persist the close when the server deadline passes so every device updates.
  const closedFor = useRef<string | null>(null);
  useEffect(() => {
    const qid = view?.question?.id;
    if (phase === "active" && remainingMs === 0 && qid && closedFor.current !== qid) {
      closedFor.current = qid;
      void run("end_question");
    }
  }, [phase, remainingMs, view?.question?.id, run]);

  if (fatal) {
    return <MessageScreen title="Game not available" message={fatal.message} action={{ label: "Back to dashboard", href: "/admin" }} mood="wow" />;
  }
  if (!view) return <FullPageSpinner label="Restoring the live game…" />;

  const answerCount = liveCount && liveCount.questionId === view.question?.id ? Math.max(liveCount.count, view.answerCount) : view.answerCount;

  return (
    <>
      <ConnectionBanner realtime={realtime} networkError={networkError} onRetry={() => void refresh()} />
      <HostStage view={view} realtime={realtime} remainingMs={remainingMs} answerCount={answerCount} busy={busy} run={run} />
    </>
  );
}
