import type { GamePhase } from "@/lib/game/types";

export type MusicTrack = "lobby" | "think";
export type Cue = "join" | "next" | "round" | "go" | "pause" | "resume" | "timeUp" | "reveal" | "leaderboard" | "champion";
export type Tick = "tick" | "urgent";

export interface StageSnapshot {
  phase: GamePhase;
  questionIndex: number;
  isNewRound: boolean;
  /** The question plays its own clip (opening song, voice line). */
  hasAudio: boolean;
}

/** Background music for a phase. Silent while a question plays its own clip, so the song is heard clearly. */
export function musicFor(s: StageSnapshot): MusicTrack | null {
  switch (s.phase) {
    case "lobby":
    case "ready":
    case "results":
    case "leaderboard":
    case "final":
      return "lobby";
    case "active":
      return s.hasAudio ? null : "think";
    case "paused":
    case "closed":
      return null;
  }
}

/** One-shot effect for moving between phases; nothing on first load so a host refresh is quiet. */
export function cueFor(prev: StageSnapshot | null, next: StageSnapshot): Cue | null {
  if (!prev || (prev.phase === next.phase && prev.questionIndex === next.questionIndex)) return null;
  switch (next.phase) {
    case "ready":
      return next.isNewRound ? "round" : "next";
    case "active":
      return prev.phase === "paused" ? "resume" : "go";
    case "paused":
      return "pause";
    case "closed":
      return "timeUp";
    case "results":
      return "reveal";
    case "leaderboard":
      return "leaderboard";
    case "final":
      return "champion";
    case "lobby":
      return null;
  }
}

/** Seconds to hold the music back so a stinger is heard on its own. */
export const MUSIC_DELAY: Partial<Record<Cue, number>> = { round: 1, reveal: 1.6, champion: 3.2 };

/** Clock ticks over the last five seconds, sharper for the final three. */
export function tickFor(secondsLeft: number): Tick | null {
  if (secondsLeft < 1 || secondsLeft > 5) return null;
  return secondsLeft <= 3 ? "urgent" : "tick";
}
