import { BASE_POINTS, MAX_SPEED_BONUS } from "./constants";
import type { AnswerRow, LeaderboardEntry, PlayerRow, PublicPlayerRow, StandingRow } from "./game/types";
import { clamp } from "./utils";

export interface ScoreInput {
  isCorrect: boolean;
  responseTimeMs: number;
  timeLimitMs: number;
  multiplier: number;
  basePoints?: number;
}

/**
 * Correct: base (500) + speed bonus (0–500, linear in remaining time), times the
 * round multiplier (1, 2 or 3). Incorrect or unanswered: 0.
 */
export function calculatePoints({
  isCorrect,
  responseTimeMs,
  timeLimitMs,
  multiplier,
  basePoints = BASE_POINTS,
}: ScoreInput): number {
  if (!isCorrect) return 0;
  const limit = Math.max(1, timeLimitMs);
  const elapsed = clamp(responseTimeMs, 0, limit);
  const speedBonus = Math.round(MAX_SPEED_BONUS * (1 - elapsed / limit));
  const safeMultiplier = [1, 2, 3].includes(multiplier) ? multiplier : 1;
  return (basePoints + speedBonus) * safeMultiplier;
}

export interface RankablePlayer {
  id: string;
  nickname: string;
  score: number;
  total_correct_response_time: number;
  joined_at: string;
}

/**
 * Highest score first. Ties are broken by the lowest total response time across
 * correct answers, then by who joined first, so ranks are always unique.
 */
export function comparePlayers(a: RankablePlayer, b: RankablePlayer): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.total_correct_response_time !== b.total_correct_response_time) {
    return a.total_correct_response_time - b.total_correct_response_time;
  }
  const joined = Date.parse(a.joined_at) - Date.parse(b.joined_at);
  if (joined !== 0) return joined;
  return a.nickname.localeCompare(b.nickname) || a.id.localeCompare(b.id);
}

export function rankPlayers<T extends RankablePlayer & { kicked?: boolean }>(players: T[]): (T & { rank: number })[] {
  return players
    .filter((p) => !p.kicked)
    .sort(comparePlayers)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

export function toLeaderboard(players: PublicPlayerRow[], limit?: number): LeaderboardEntry[] {
  const ranked = rankPlayers(players).map((p) => ({
    playerId: p.id,
    nickname: p.nickname,
    rank: p.rank,
    score: p.score,
    streak: p.streak,
    correctCount: p.correct_answer_count,
    totalCorrectResponseTimeMs: p.total_correct_response_time,
    lastPoints: p.last_points,
  }));
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

/**
 * Rebuild every player's totals from their stored answers. Only questions whose
 * answer has been revealed are counted, so the public players table never leaks
 * correctness before the reveal. Recomputing from scratch keeps the operation
 * idempotent if the host double-clicks or a request is retried.
 */
export function computeStandings(
  players: Pick<PlayerRow, "id">[],
  answers: Pick<AnswerRow, "player_id" | "question_id" | "is_correct" | "points_awarded" | "response_time_ms">[],
  countedQuestionIds: string[],
): StandingRow[] {
  const byPlayer = new Map<string, Map<string, (typeof answers)[number]>>();
  const counted = new Set(countedQuestionIds);
  for (const answer of answers) {
    if (!counted.has(answer.question_id)) continue;
    let map = byPlayer.get(answer.player_id);
    if (!map) byPlayer.set(answer.player_id, (map = new Map()));
    map.set(answer.question_id, answer);
  }

  return players.map((player) => {
    const mine = byPlayer.get(player.id) ?? new Map();
    let score = 0;
    let streak = 0;
    let bestStreak = 0;
    let correct = 0;
    let totalCorrectTime = 0;
    let lastPoints = 0;

    for (const questionId of countedQuestionIds) {
      const answer = mine.get(questionId);
      if (answer?.is_correct) {
        score += answer.points_awarded;
        correct += 1;
        totalCorrectTime += answer.response_time_ms;
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
      } else {
        streak = 0;
      }
      lastPoints = answer?.is_correct ? answer.points_awarded : 0;
    }

    return {
      id: player.id,
      score,
      streak,
      best_streak: bestStreak,
      correct_answer_count: correct,
      total_correct_response_time: totalCorrectTime,
      last_points: lastPoints,
    };
  });
}
