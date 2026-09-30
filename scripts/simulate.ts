/**
 * 50-player load simulation.
 *
 *   npm run simulate                 in-memory: the real GameService with a fake clock
 *   npm run simulate:live            over HTTP against a running deployment + Supabase
 *
 * Live mode env: SIM_BASE_URL (default http://localhost:3000), ADMIN_PASSWORD,
 * SIM_PLAYERS (default 50), SIM_KEEP=1 to keep the temporary quiz afterwards.
 */
import { randomUUID } from "node:crypto";
import { MAX_PLAYERS } from "../src/lib/constants";
import type { HostAction } from "../src/lib/game/service";
import type { HostView, PlayerView } from "../src/lib/game/types";
import { createBlankQuestion, createBlankRound, type QuizContent } from "../src/lib/quiz/schema";
import { calculatePoints } from "../src/lib/scoring";
import { runMemorySimulation } from "./simulation";

try {
  process.loadEnvFile(".env.local");
} catch {
  // optional
}

const live = process.argv.includes("--live");

async function memory() {
  console.log("Running in-memory 50-player simulation…\n");
  const report = await runMemorySimulation({ log: (line) => console.log(line) });
  console.log("\nSummary");
  console.table({
    players: report.players,
    overflowRejected: report.rejectedOverflow,
    questions: report.questions,
    answers: report.answersSubmitted,
    duplicatesRejected: report.duplicatesRejected,
    lateRejected: report.lateRejected,
  });
  console.log("Podium:", report.podium.map((p, i) => `${i + 1}. ${p.nickname} (${p.score})`).join("  "));
  const failed = report.checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error(`\n${failed.length} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function liveRun() {
  const base = (process.env.SIM_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const password = process.env.ADMIN_PASSWORD;
  const playerCount = Math.min(Number(process.env.SIM_PLAYERS ?? MAX_PLAYERS), MAX_PLAYERS);
  if (!password) throw new Error("Set ADMIN_PASSWORD (or put it in .env.local) for live mode.");
  console.log(`Live simulation against ${base} with ${playerCount} players\n`);

  let cookie = "";
  async function call<T>(path: string, init: RequestInit & { json?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
    const { json, headers, ...rest } = init;
    const res = await fetch(`${base}${path}`, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new HttpError(res.status, body?.error?.code ?? "HTTP", body?.error?.message ?? res.statusText);
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    return body as T;
  }

  await call("/api/admin/login", { method: "POST", json: { password } });
  console.log("✔ Logged in as organizer");

  const { id: quizId } = await call<{ id: string }>("/api/admin/quizzes", {
    method: "POST",
    json: { title: `[Simulation] ${new Date().toISOString()}`, subtitle: "Temporary load test" },
  });

  try {
    const round = createBlankRound(0);
    round.questions = [1, 2, 3].map((multiplier, i) => {
      const q = createBlankQuestion("TRIVIA", multiplier as 1 | 2 | 3);
      q.prompt = `Simulation question ${i + 1}`;
      q.choices.forEach((c) => (c.text = `Option ${c.label}`));
      q.correctLabel = (["A", "B", "C"] as const)[i];
      q.timeLimitSeconds = 10;
      return q;
    });
    const content: QuizContent = { title: `[Simulation] ${quizId}`, subtitle: "Temporary load test", description: null, rounds: [round] };
    const detail = await call<{ content: QuizContent }>(`/api/admin/quizzes/${quizId}`, { method: "PUT", json: content });
    await call(`/api/admin/quizzes/${quizId}`, { method: "PATCH", json: { status: "published" } });
    const saved = detail.content.rounds[0].questions;
    console.log(`✔ Created and published a ${saved.length}-question quiz`);

    const { sessionId, pin } = await call<{ sessionId: string; pin: string }>(`/api/admin/quizzes/${quizId}/sessions`, { method: "POST" });
    console.log(`✔ Game PIN ${pin}`);

    let hostView = await call<HostView>(`/api/admin/sessions/${sessionId}`);
    const act = async (action: HostAction) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          hostView = await call<HostView>(`/api/admin/sessions/${sessionId}/actions`, {
            method: "POST",
            json: { action, expectedVersion: hostView.session.stateVersion },
          });
          return;
        } catch (e) {
          if (!(e instanceof HttpError && e.code === "VERSION_CONFLICT")) throw e;
          hostView = await call<HostView>(`/api/admin/sessions/${sessionId}`);
        }
      }
      throw new Error(`${action} kept conflicting`);
    };

    const t0 = Date.now();
    const devices = Array.from({ length: playerCount }, (_, i) => ({ nickname: `Sim ${i + 1}`, token: `sim-${randomUUID()}` }));
    const players = await Promise.all(
      devices.map(async (d) => {
        const res = await call<{ playerId: string }>(`/api/games/${pin}/join`, { method: "POST", json: { nickname: d.nickname, deviceToken: d.token } });
        return { ...d, playerId: res.playerId };
      }),
    );
    console.log(`✔ ${players.length} players joined concurrently in ${Date.now() - t0} ms`);

    if (playerCount === MAX_PLAYERS) {
      const overflow = await call(`/api/games/${pin}/join`, { method: "POST", json: { nickname: "Number 51", deviceToken: `sim-${randomUUID()}` } }).catch((e) => e);
      if (!(overflow instanceof HttpError && overflow.code === "ROOM_FULL")) throw new Error("51st player was not rejected");
      console.log("✔ 51st player rejected (ROOM_FULL)");
    }

    const headersFor = (p: (typeof players)[number]) => ({ "x-player-id": p.playerId, "x-player-token": p.token });
    await act("start_game");

    let mismatches = 0;
    for (const [i, q] of saved.entries()) {
      await act("start_question");
      const correctId = q.choices.find((c) => c.label === q.correctLabel)!.id;
      const wrongId = q.choices.find((c) => c.label !== q.correctLabel && c.text)!.id;
      const started = Date.now();
      const outcomes = await Promise.all(
        players.map(async (p, n) => {
          await new Promise((r) => setTimeout(r, Math.random() * 3000));
          const choiceId = n % 3 === 0 ? wrongId : correctId;
          const send = () => call<{ duplicate: boolean }>("/api/play/answer", { method: "POST", headers: headersFor(p), json: { questionId: q.id, choiceId } });
          const [first, second] = await Promise.all([send(), n % 5 === 0 ? send() : Promise.resolve(null)]);
          return [first, second].filter(Boolean).filter((r) => r!.duplicate).length;
        }),
      );
      const dupes = outcomes.reduce((a, b) => a + b, 0);
      console.log(`  Q${i + 1}: ${players.length} answers in ${Date.now() - started} ms, ${dupes} duplicate taps absorbed`);

      await act("end_question");
      await act("reveal");
      const views = await Promise.all(players.map((p) => call<PlayerView>("/api/play/state", { headers: headersFor(p) })));
      for (const v of views) {
        const r = v.result!;
        const expected = calculatePoints({ isCorrect: r.correct, responseTimeMs: r.responseTimeMs ?? 0, timeLimitMs: q.timeLimitSeconds * 1000, multiplier: q.multiplier });
        if (!r.answered || expected !== r.pointsAwarded) mismatches += 1;
      }
      console.log(`  Q${i + 1}: revealed — ${hostView.results?.correctCount}/${hostView.results?.answeredCount} correct, fastest ${hostView.results?.fastest?.nickname}`);
      await act("show_leaderboard");
      await act("next_question");
    }

    const final = await call<HostView>(`/api/admin/sessions/${sessionId}`);
    if (final.session.phase !== "final") throw new Error(`Expected final phase, got ${final.session.phase}`);
    if (mismatches) throw new Error(`${mismatches} scoring mismatches`);
    console.log("✔ Server scores match the scoring formula for every player");
    console.log(`✔ Champion: ${final.podium[0]?.nickname} with ${final.podium[0]?.score} points`);
    console.log("\nLive simulation passed.");
  } finally {
    if (process.env.SIM_KEEP !== "1") {
      await call(`/api/admin/quizzes/${quizId}`, { method: "DELETE" }).catch(() => undefined);
      console.log("Cleaned up the temporary quiz.");
    }
  }
}

(live ? liveRun() : memory()).catch((error) => {
  console.error("\nSimulation failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
