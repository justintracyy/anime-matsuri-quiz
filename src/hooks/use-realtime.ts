"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export type RealtimeStatus = "connecting" | "live" | "offline" | "unavailable";

export interface TableSubscription {
  table: "game_sessions" | "players" | "question_progress";
  filter: string;
}

/**
 * Subscribes to Supabase Realtime Postgres changes. The callback is kept in a
 * ref so changing it does not resubscribe. Supabase re-joins the channel
 * automatically after network drops; `status` reflects the current state so the
 * UI can show reconnection banners and fall back to faster polling.
 */
export function useRealtimeTables(
  channelKey: string | null,
  subscriptions: TableSubscription[],
  onChange: (table: TableSubscription["table"], payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);

  const subsKey = subscriptions.map((s) => `${s.table}:${s.filter}`).join("|");

  useEffect(() => {
    if (!channelKey) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      queueMicrotask(() => setStatus("unavailable"));
      return;
    }
    const channel = supabase.channel(`${channelKey}:${Math.random().toString(36).slice(2, 8)}`);
    for (const part of subsKey.split("|")) {
      const [table, filter] = part.split(/:(.*)/s) as [TableSubscription["table"], string];
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => callback.current(table, payload),
      );
    }
    channel.subscribe((state) => {
      if (state === "SUBSCRIBED") setStatus("live");
      else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") setStatus("offline");
    });

    const onOnline = () => setStatus((s) => (s === "live" ? s : "connecting"));
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      supabase.removeChannel(channel);
    };
  }, [channelKey, subsKey]);

  return status;
}
