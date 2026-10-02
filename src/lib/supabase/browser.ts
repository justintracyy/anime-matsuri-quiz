"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Anonymous browser client used only for Realtime subscriptions. RLS limits it
 * to game state, public player fields and answer counts.
 */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }
  client = createClient(origin, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Heartbeats from a Web Worker keep the socket alive when the tab is in the background
    // or the phone screen dims, where browsers throttle normal timers.
    realtime: { params: { eventsPerSecond: 20 }, worker: true },
  });
  return client;
}
