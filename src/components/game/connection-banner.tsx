"use client";

import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, WifiOff } from "lucide-react";
import type { RealtimeStatus } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";

export function ConnectionBanner({
  realtime,
  networkError,
  onRetry,
}: {
  realtime: RealtimeStatus;
  networkError: string | null;
  onRetry: () => void;
}) {
  const show = !!networkError || realtime === "offline" || realtime === "unavailable";
  const message = networkError
    ? networkError
    : realtime === "unavailable"
      ? "Live updates are not configured — refreshing every few seconds instead."
      : "Live connection lost. Reconnecting… (updates continue every few seconds)";
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-plum-dark px-4 py-2 text-sm text-white"
        >
          <WifiOff className="size-4 shrink-0" />
          <span className="text-balance">{message}</span>
          <Button size="sm" variant="secondary" onClick={onRetry} className="h-7">
            <RefreshCw /> Retry
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function LiveDot({ status }: { status: RealtimeStatus }) {
  const color = status === "live" ? "bg-emerald-500" : status === "connecting" ? "bg-gold" : "bg-error";
  const label = status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Reconnecting";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-text" title={`Realtime: ${label}`}>
      <span className={`size-2 rounded-full ${color} ${status !== "live" ? "animate-pulse-soft" : ""}`} />
      {label}
    </span>
  );
}
