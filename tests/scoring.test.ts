import { describe, expect, it } from "vitest";
import { calculatePoints, computeStandings, rankPlayers, toLeaderboard } from "@/lib/scoring";
import type { PublicPlayerRow } from "@/lib/game/types";

function player(id: string, score: number, time: number, joinedOffset = 0): PublicPlayerRow {
  return {
    id,
    game_session_id: "s",
    nickname: id,
    score,
    streak: 0,
    best_streak: 0,
    correct_answer_count: 0,
    total_correct_response_time: time,
    last_points: 0,
    connected: true,
    kicked: false,
    joined_at: new Date(Date.UTC(2026, 8, 30, 18, 0, joinedOffset)).toISOString(),
    last_seen_at: new Date().toISOString(),
  };
}

describe("calculatePoints", () => {
  const base = { timeLimitMs: 20_000, multiplier: 1 };

  it("awards 1000 for an instant correct answer and 500 at the buzzer", () => {
    expect(calculatePoints({ ...base, isCorrect: true, responseTimeMs: 0 })).toBe(1000);
    expect(calculatePoints({ ...base, isCorrect: true, responseTimeMs: 20_000 })).toBe(500);
  });

  it("scales the speed bonus linearly", () => {
    expect(calculatePoints({ ...base, isCorrect: true, responseTimeMs: 10_000 })).toBe(750);
    expect(calculatePoints({ ...base, isCorrect: true, responseTimeMs: 5_000 })).toBe(875);
  });

  it("gives zero for wrong or unanswered", () => {
    expect(calculatePoints({ ...base, isCorrect: false, responseTimeMs: 100 })).toBe(0);
  });

  it("applies double and triple multipliers", () => {
    expect(calculatePoints({ ...base, isCorrect: true, responseTimeMs: 0, multiplier: 2 })).toBe(2000);
    expect(calculatePoints({ ...base, isCorrect: true, responseTimeMs: 10_000, multiplier: 3 })).toBe(2250);
  });

  it("clamps out-of-range inputs and ignores invalid multipliers", () => {
    expect(calculatePoints({ ...base, isCorrect: true, responseTimeMs: -50 })).toBe(1000);
    expect(calculatePoints({ ...base, isCorrect: true, responseTimeMs: 99_999 })).toBe(500);
    expect(calculatePoints({ ...base, isCorrect: true, responseTimeMs: 0, multiplier: 7 })).toBe(1000);
  });
});

describe("ranking", () => {
  it("sorts by score, then by lower total correct response time", () => {
    const ranked = rankPlayers([player("slow", 1500, 9000), player("top", 2000, 12000), player("fast", 1500, 3000)]);
    expect(ranked.map((p) => [p.id, p.rank])).toEqual([
      ["top", 1],
      ["fast", 2],
      ["slow", 3],
    ]);
  });

  it("falls back to join order for an exact tie and excludes kicked players", () => {
    const kicked = { ...player("kicked", 9999, 0), kicked: true };
    const ranked = rankPlayers([player("late", 1000, 500, 10), player("early", 1000, 500, 1), kicked]);
    expect(ranked.map((p) => p.id)).toEqual(["early", "late"]);
  });

  it("limits the leaderboard to the top N", () => {
    const players = Array.from({ length: 8 }, (_, i) => player(`p${i}`, i * 100, 0));
    const top = toLeaderboard(players, 5);
    expect(top).toHaveLength(5);
    expect(top[0]).toMatchObject({ playerId: "p7", rank: 1, score: 700 });
  });
});

describe("computeStandings", () => {
  const answers = [
    { player_id: "a", question_id: "q1", is_correct: true, points_awarded: 900, response_time_ms: 2000 },
    { player_id: "a", question_id: "q2", is_correct: true, points_awarded: 800, response_time_ms: 4000 },
    { player_id: "a", question_id: "q3", is_correct: false, points_awarded: 0, response_time_ms: 1000 },
    { player_id: "b", question_id: "q1", is_correct: false, points_awarded: 0, response_time_ms: 1000 },
    { player_id: "b", question_id: "q2", is_correct: true, points_awarded: 950, response_time_ms: 1000 },
    { player_id: "b", question_id: "q3", is_correct: true, points_awarded: 600, response_time_ms: 3000 },
  ];

  it("totals only counted (revealed) questions", () => {
    const [a, b] = computeStandings([{ id: "a" }, { id: "b" }], answers, ["q1"]);
    expect(a).toMatchObject({ score: 900, correct_answer_count: 1, streak: 1, total_correct_response_time: 2000 });
    expect(b).toMatchObject({ score: 0, correct_answer_count: 0, streak: 0 });
  });

  it("tracks current and best streaks and last points", () => {
    const [a, b] = computeStandings([{ id: "a" }, { id: "b" }], answers, ["q1", "q2", "q3"]);
    expect(a).toMatchObject({ score: 1700, streak: 0, best_streak: 2, last_points: 0 });
    expect(b).toMatchObject({ score: 1550, streak: 2, best_streak: 2, last_points: 600, total_correct_response_time: 4000 });
  });

  it("is idempotent", () => {
    const once = computeStandings([{ id: "a" }], answers, ["q1", "q2"]);
    const twice = computeStandings([{ id: "a" }], answers, ["q1", "q2"]);
    expect(twice).toEqual(once);
  });
});
