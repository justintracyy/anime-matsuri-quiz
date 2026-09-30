"use client";

import { motion } from "framer-motion";
import { Crown, Trophy } from "lucide-react";
import { SakuraBlossom, SakuraPetal, PaperLantern } from "@/components/brand/decorations";
import { EVENT_NAME, EVENT_THEME } from "@/lib/constants";
import type { LeaderboardEntry } from "@/lib/game/types";
import { cn, formatPoints } from "@/lib/utils";

function rand(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function PetalConfetti({ count = 60, delay = 0 }: { count?: number; delay?: number }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const x = rand(i) * 100;
        const size = 14 + rand(i + 50) * 18;
        const duration = 3.5 + rand(i + 100) * 3;
        const rotate = (rand(i + 150) - 0.5) * 900;
        const drift = (rand(i + 200) - 0.5) * 240;
        return (
          <motion.div
            key={i}
            className="absolute -top-10"
            style={{ left: `${x}%`, width: size, height: size }}
            initial={{ y: "-10vh", x: 0, rotate: 0, opacity: 0 }}
            animate={{ y: "110vh", x: drift, rotate, opacity: [0, 1, 1, 0.8, 0] }}
            transition={{ duration, delay: delay + rand(i + 250) * 2.5, repeat: Infinity, repeatDelay: rand(i + 300) * 2, ease: "easeIn" }}
          >
            {i % 5 === 0 ? <SakuraBlossom className="size-full" /> : <SakuraPetal className="size-full" />}
          </motion.div>
        );
      })}
    </div>
  );
}

const PODIUM = [
  { place: 2, height: "h-36 md:h-44", color: "from-[#bda6c4] to-lavender", delay: 3.0 },
  { place: 1, height: "h-48 md:h-60", color: "from-[#f0cf9e] to-gold", delay: 3.4 },
  { place: 3, height: "h-28 md:h-32", color: "from-sakura-light to-sakura", delay: 2.6 },
];

export function Podium({ podium, highlightId }: { podium: LeaderboardEntry[]; highlightId?: string }) {
  return (
    <div className="flex items-end justify-center gap-2 md:gap-4" aria-label="Top three podium">
      {PODIUM.map(({ place, height, color, delay }) => {
        const entry = podium[place - 1];
        return (
          <motion.div
            key={place}
            className="flex w-28 flex-col items-center md:w-44"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, type: "spring", stiffness: 140, damping: 16 }}
          >
            {entry ? (
              <>
                {place === 1 && <Crown className="mb-1 size-8 text-gold" aria-hidden="true" />}
                <p className={cn("max-w-full truncate text-center text-lg font-bold text-plum-dark md:text-2xl", entry.playerId === highlightId && "text-sakura")}>
                  {entry.nickname}
                </p>
                <p className="mb-2 text-sm font-semibold tabular-nums text-muted-text md:text-base">{formatPoints(entry.score)} pts</p>
              </>
            ) : (
              <p className="mb-2 text-sm text-muted-text">—</p>
            )}
            <div className={cn("flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b pt-3 shadow-[var(--shadow-soft)]", height, color)}>
              <span className="font-serif text-4xl font-bold text-white drop-shadow md:text-6xl">{place}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function ChampionshipScreen({ podium, highlightId }: { podium: LeaderboardEntry[]; highlightId?: string }) {
  const champion = podium[0];
  const lines = ["AND THE", "ANIME MATSURI", "GUESSING GAME", "CHAMPION IS"];
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 text-center">
      <PetalConfetti delay={1.8} />
      <PaperLantern className="absolute -top-4 left-[6%] w-16 origin-top animate-lantern-sway md:w-24" label="祝" />
      <PaperLantern className="absolute -top-4 right-[6%] w-16 origin-top animate-lantern-sway [animation-delay:-2s] md:w-24" label="桜" />

      <div className="relative z-10 flex flex-col items-center">
        {lines.map((line, i) => (
          <motion.p
            key={line}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.35 }}
            className={cn(
              "font-serif font-bold uppercase tracking-[0.18em] text-plum-dark",
              i === 1 || i === 2 ? "text-3xl md:text-5xl" : "text-lg text-lavender md:text-2xl",
            )}
          >
            {line}
          </motion.p>
        ))}

        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.8, type: "spring", stiffness: 120, damping: 12 }}
          className="my-6 rounded-3xl border-4 border-gold bg-white px-8 py-5 shadow-[var(--shadow-gold)] md:px-14 md:py-7"
        >
          <Trophy className="mx-auto mb-2 size-10 text-gold md:size-14" aria-hidden="true" />
          <h1 className="gold-text max-w-[80vw] truncate font-serif text-5xl font-extrabold md:text-8xl" aria-live="polite">
            {champion?.nickname ?? "—"}
          </h1>
          {champion && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-base font-semibold text-plum md:text-xl">
              <span>
                <span className="font-serif text-2xl font-bold text-gold md:text-3xl">{formatPoints(champion.score)}</span> points
              </span>
              <span>
                <span className="font-serif text-2xl font-bold text-gold md:text-3xl">{champion.correctCount}</span> correct answers
              </span>
            </div>
          )}
        </motion.div>

        <Podium podium={podium} highlightId={highlightId} />

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 4.2 }} className="mt-10 space-y-1">
          <p className="font-serif text-3xl font-bold text-plum-dark md:text-4xl">Arigatou • Thank You</p>
          <p className="text-lg font-semibold text-lavender">
            {EVENT_NAME} • {EVENT_THEME}
          </p>
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-sakura">Games • Music • Prizes • &amp; More</p>
        </motion.div>
      </div>
    </div>
  );
}
