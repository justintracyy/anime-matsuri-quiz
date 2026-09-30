"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flame } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/game/types";
import { cn, formatPoints } from "@/lib/utils";

const RANK_STYLE = ["bg-gold text-white", "bg-lavender text-white", "bg-sakura text-white"];

export function Leaderboard({ entries, highlightId, title = "Top 5" }: { entries: LeaderboardEntry[]; highlightId?: string; title?: string }) {
  const top = entries[0]?.score || 1;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <h2 className="mb-5 text-center font-serif text-4xl font-bold md:text-5xl">{title}</h2>
      {entries.length === 0 && <p className="text-center text-muted-text">No scores yet.</p>}
      <ol className="flex flex-col gap-3">
        <AnimatePresence initial>
          {entries.map((entry, i) => (
            <motion.li
              layout
              key={entry.playerId}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12, type: "spring", stiffness: 220, damping: 24 }}
              className={cn(
                "relative flex items-center gap-4 overflow-hidden rounded-2xl border-2 border-dusty-pink bg-white px-4 py-3 shadow-[var(--shadow-soft)]",
                entry.playerId === highlightId && "border-sakura ring-4 ring-sakura-light",
              )}
            >
              <motion.div
                className="absolute inset-y-0 left-0 bg-blush"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(4, (entry.score / top) * 100)}%` }}
                transition={{ delay: 0.2 + i * 0.12, duration: 0.8 }}
                aria-hidden="true"
              />
              <span className={cn("relative flex size-11 shrink-0 items-center justify-center rounded-full font-serif text-xl font-bold", RANK_STYLE[i] ?? "bg-lavender-mist text-plum")}>
                {entry.rank}
              </span>
              <span className="relative min-w-0 flex-1 truncate text-xl font-bold text-plum-dark md:text-2xl">{entry.nickname}</span>
              {entry.streak >= 2 && (
                <span className="relative flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-sm font-bold text-[#8a5c2a]" title={`${entry.streak} correct in a row`}>
                  <Flame className="size-4 text-[#e0793f]" />
                  {entry.streak}
                </span>
              )}
              {entry.lastPoints > 0 && (
                <span className="relative hidden text-sm font-semibold text-sakura sm:inline">+{formatPoints(entry.lastPoints)}</span>
              )}
              <span className="relative font-serif text-2xl font-bold tabular-nums text-plum md:text-3xl">{formatPoints(entry.score)}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  );
}
