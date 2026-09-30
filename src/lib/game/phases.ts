import type { GamePhase } from "./types";

/**
 * The database phase stays "active" until someone persists the close, but once the
 * server-side deadline passes the question is treated as closed everywhere.
 */
export function effectivePhase(
  session: { phase: GamePhase; question_ends_at: string | null },
  nowMs: number,
): GamePhase {
  if (session.phase === "active" && session.question_ends_at && nowMs >= Date.parse(session.question_ends_at)) {
    return "closed";
  }
  return session.phase;
}

export function isRevealPhase(phase: GamePhase): boolean {
  return phase === "results" || phase === "leaderboard" || phase === "final";
}

export function isQuestionLive(phase: GamePhase): boolean {
  return phase === "active" || phase === "paused";
}

export const PHASE_LABEL: Record<GamePhase, string> = {
  lobby: "Lobby",
  ready: "Get ready",
  active: "Question live",
  paused: "Paused",
  closed: "Time's up",
  results: "Answer revealed",
  leaderboard: "Leaderboard",
  final: "Championship",
};
