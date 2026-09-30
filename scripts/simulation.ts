import { randomUUID } from "node:crypto";
import { MAX_PLAYERS } from "../src/lib/constants";
import { GameError } from "../src/lib/game/errors";
import { MemoryGameStore, type MemoryQuiz } from "../src/lib/game/memory-store";
import { GameService, type HostAction } from "../src/lib/game/service";
import type { QuestionRecord } from "../src/lib/game/types";
import { calculatePoints } from "../src/lib/scoring";

export interface SimulationReport {
  players: number;
  rejectedOverflow: number;
  questions: number;
  answersSubmitted: number;
  duplicatesRejected: number;
  lateRejected: number;
  scoringMismatches: string[];
  podium: { nickname: string; score: number }[];
  champion: string | null;
  checks: { name: string; ok: boolean; detail?: string }[];
}

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function question(i: number, multiplier: number, timeLimitSeconds: number): QuestionRecord {
  const choices = (["A", "B", "C", "D"] as const).map((label, position) => ({ id: randomUUID(), label, text: `Option ${label}`, position }));
  return {
    id: randomUUID(),
    round_id: `round-${multiplier}`,
    round_title: `Round ${multiplier}`,
    round_position: multiplier - 1,
    type: "TRIVIA",
    prompt: `Simulation question ${i + 1}`,
    correct_choice_id: choices[i % 4].id,
    time_limit_seconds: timeLimitSeconds,
    base_points: 500,
    multiplier,
    explanation: null,
    media_path: null,
    original_media_path: null,
    audio_path: null,
    audio_start_seconds: 0,
    audio_duration_seconds: null,
    allow_audio_replay: true,
    choices,
  };
}

/**
 * Plays a complete game with 50 simulated players against the real GameService
 * (in-memory store, controllable clock): capacity overflow, concurrent joins,
 * concurrent and duplicate answers, late answers, reveal, leaderboard and final.
 */
export async function runMemorySimulation({ playerCount = MAX_PLAYERS, seed = 42, log = (_: string) => {} } = {}): Promise<SimulationReport> {
  const random = seededRandom(seed);
  let now = Date.parse("2026-09-30T19:00:00.000Z");
  const clock = () => new Date(now);
  const store = new MemoryGameStore(clock);
  const service = new GameService({ store, now: clock });
  const questions = [question(0, 1, 20), question(1, 1, 15), question(2, 2, 20), question(3, 3, 10)];
  const quiz: MemoryQuiz = { id: randomUUID(), title: "Simulation Quiz", subtitle: null, status: "published", questions };
  store.addQuiz(quiz);

  const checks: SimulationReport["checks"] = [];
  const check = (name: string, ok: boolean, detail?: string) => {
    checks.push({ name, ok, detail });
    log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  };

  const session = await service.createSession(quiz.id);
  log(`Created game ${session.game_pin}`);

  const attempts = Array.from({ length: playerCount + 5 }, (_, i) => ({ nickname: `Spirit ${i + 1}`, token: `sim-device-${i}-${randomUUID()}` }));
  const first = await service.joinGame(session.game_pin, attempts[0].nickname, attempts[0].token);
  const dup = await service.joinGame(session.game_pin, "spirit 1", `sim-device-dup-${randomUUID()}`).catch((e) => e);
  check("Duplicate nickname rejected with suggestion", dup instanceof GameError && dup.code === "NICKNAME_TAKEN" && !!dup.details);

  // Everyone else scans the QR code at the same time (+5 extra people for a full room).
  const joins = await Promise.allSettled(attempts.slice(1).map((a) => service.joinGame(session.game_pin, a.nickname, a.token)));
  const joined = [
    { ...attempts[0], playerId: first.player.id },
    ...joins.flatMap((r, i) => (r.status === "fulfilled" ? [{ ...attempts[i + 1], playerId: r.value.player.id }] : [])),
  ];
  const rejected = joins.filter((r) => r.status === "rejected" && r.reason instanceof GameError && r.reason.code === "ROOM_FULL").length;
  check(`${playerCount} players joined, overflow rejected`, joined.length === Math.min(playerCount, MAX_PLAYERS) && rejected === attempts.length - joined.length, `${joined.length} joined, ${rejected} ROOM_FULL`);

  const act = async (action: HostAction) => {
    const view = await service.getHostView(session.id);
    await service.hostAction(session.id, { action, expectedVersion: view.session.stateVersion });
  };

  await act("start_game");
  const expected = new Map<string, number>(joined.map((p) => [p.playerId, 0]));
  let answersSubmitted = 0;
  let duplicatesRejected = 0;
  let lateRejected = 0;
  const scoringMismatches: string[] = [];

  for (const q of questions) {
    await act("start_question");
    const start = now;
    const limitMs = q.time_limit_seconds * 1000;
    // 90% answer, 10% time out. 70% of answers are correct.
    const plans = joined
      .filter(() => random() < 0.9)
      .map((p) => ({ p, at: Math.floor(random() * limitMs), correct: random() < 0.7 }))
      .sort((a, b) => a.at - b.at);

    let lastAt = 0;
    for (const batch of groupBy(plans, (x) => Math.floor(x.at / 500))) {
      now = start + batch[0].at;
      lastAt = batch[0].at;
      // Answers in the same half-second arrive concurrently; some players double-tap.
      const calls = batch.flatMap(({ p, correct }) => {
        const choiceId = correct ? q.correct_choice_id! : q.choices.find((c) => c.id !== q.correct_choice_id)!.id;
        const send = () => service.submitAnswer(p.playerId, p.token, q.id, choiceId);
        return random() < 0.2 ? [send(), send()] : [send()];
      });
      const results = await Promise.allSettled(calls);
      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value.duplicate) duplicatesRejected += 1;
          else answersSubmitted += 1;
        } else if (!(r.reason instanceof GameError && r.reason.code === "TIME_UP")) {
          throw r.reason;
        }
      }
    }

    // Stragglers after the deadline + grace are refused.
    now = start + Math.max(lastAt, limitMs) + 2000;
    const answeredIds = new Set((await store.listAnswers(session.id, [q.id])).map((a) => a.player_id));
    const straggler = joined.find((p) => !answeredIds.has(p.playerId));
    if (straggler) {
      const late = await service.submitAnswer(straggler.playerId, straggler.token, q.id, q.correct_choice_id!).catch((e) => e);
      if (late instanceof GameError && late.code === "TIME_UP") lateRejected += 1;
    }

    await act("end_question");
    await act("reveal");

    const answers = await store.listAnswers(session.id, [q.id]);
    for (const a of answers) {
      const points = calculatePoints({ isCorrect: a.is_correct, responseTimeMs: a.response_time_ms, timeLimitMs: limitMs, multiplier: q.multiplier });
      if (points !== a.points_awarded) scoringMismatches.push(`${a.player_id} on ${q.prompt}: ${a.points_awarded} ≠ ${points}`);
      expected.set(a.player_id, (expected.get(a.player_id) ?? 0) + points);
    }
    const unique = new Set(answers.map((a) => a.player_id)).size;
    check(`Q${q.prompt.split(" ").pop()}: one answer per player`, unique === answers.length, `${answers.length} answers`);

    const hostView = await service.getHostView(session.id);
    const distributionTotal = Object.values(hostView.results!.distribution).reduce((a, b) => a + b, 0);
    check(`Q${q.prompt.split(" ").pop()}: distribution matches answers`, distributionTotal === answers.length);

    await act("show_leaderboard");
    await act("next_question");
    now += 3000;
  }

  const final = await service.getHostView(session.id);
  check("Game reached the championship", final.session.phase === "final");
  const wrongTotals = final.players.filter((p) => p.score !== expected.get(p.id));
  check("Every total equals the sum of server-computed points", wrongTotals.length === 0, wrongTotals.length ? `${wrongTotals.length} wrong` : undefined);
  const sorted = [...final.leaderboard].every((e, i, arr) => i === 0 || arr[i - 1].score > e.score || (arr[i - 1].score === e.score && arr[i - 1].totalCorrectResponseTimeMs <= e.totalCorrectResponseTimeMs));
  check("Leaderboard ordered by score then response time", sorted);
  check("Podium has three places", final.podium.length === Math.min(3, joined.length));

  const winner = final.podium[0];
  const winnerView = await service.getPlayerView(winner.playerId, joined.find((p) => p.playerId === winner.playerId)!.token);
  check("Champion's phone shows rank 1", winnerView.me.rank === 1);
  check("No scoring mismatches", scoringMismatches.length === 0);

  return {
    players: joined.length,
    rejectedOverflow: rejected,
    questions: questions.length,
    answersSubmitted,
    duplicatesRejected,
    lateRejected,
    scoringMismatches,
    podium: final.podium.map((p) => ({ nickname: p.nickname, score: p.score })),
    champion: winner?.nickname ?? null,
    checks,
  };
}

function groupBy<T>(items: T[], key: (item: T) => number): T[][] {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}
