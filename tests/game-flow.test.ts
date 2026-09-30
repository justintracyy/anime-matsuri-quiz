import { describe, expect, it } from "vitest";
import { ANSWER_GRACE_MS, MAX_PLAYERS } from "@/lib/constants";
import { GameError } from "@/lib/game/errors";
import { GameService } from "@/lib/game/service";
import { correctChoice, deviceToken, host, joinPlayers, makeQuestion, makeQuiz, setup, wrongChoice } from "./helpers";

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof GameError && e.code === code);
}

describe("hosting a game", () => {
  it("creates a lobby with a unique six-digit PIN", async () => {
    const { service, quiz } = setup();
    const a = await service.createSession(quiz.id);
    const b = await service.createSession(quiz.id);
    expect(a.game_pin).toMatch(/^[1-9]\d{5}$/);
    expect(a.game_pin).not.toBe(b.game_pin);
    expect(a).toMatchObject({ status: "lobby", phase: "lobby", current_question_index: -1 });
    expect(a.question_order).toEqual(quiz.questions.map((q) => q.id));
  });

  it("retries when a PIN collides with another live game", async () => {
    const { store, quiz, clock } = setup();
    const pins = ["111111", "111111", "222222"];
    const service = new GameService({ store, now: clock.now, pinGenerator: () => pins.shift()! });
    expect((await service.createSession(quiz.id)).game_pin).toBe("111111");
    expect((await service.createSession(quiz.id)).game_pin).toBe("222222");
  });

  it("refuses unpublished or empty quizzes", async () => {
    const draft = setup(makeQuiz(undefined, "draft"));
    await expectCode(draft.service.createSession(draft.quiz.id), "QUIZ_NOT_PUBLISHED");
    const empty = setup(makeQuiz([]));
    await expectCode(empty.service.createSession(empty.quiz.id), "QUIZ_EMPTY");
  });
});

describe("joining", () => {
  it("joins with any nickname and reports lobby info", async () => {
    const { service, quiz } = setup();
    const session = await service.createSession(quiz.id);
    const info = await service.getJoinInfo(session.game_pin);
    expect(info).toMatchObject({ joinable: true, reason: "ok", playerCount: 0, maxPlayers: MAX_PLAYERS });
    const { player, restored } = await service.joinGame(session.game_pin, "  Tanuki  ", deviceToken(1));
    expect(player.nickname).toBe("Tanuki");
    expect(restored).toBe(false);
    expect("token_hash" in player).toBe(false);
    expect((await service.getJoinInfo(session.game_pin)).playerCount).toBe(1);
  });

  it("rejects unknown and malformed PINs", async () => {
    const { service } = setup();
    await expectCode(service.getJoinInfo("999999"), "PIN_NOT_FOUND");
    await expectCode(service.getJoinInfo("12ab"), "PIN_NOT_FOUND");
  });

  it("rejects a duplicate nickname with a suggestion", async () => {
    const { service, quiz } = setup();
    const { game_pin } = await service.createSession(quiz.id);
    await service.joinGame(game_pin, "Kitsune", deviceToken(1));
    const error = await service.joinGame(game_pin, "KITSUNE", deviceToken(2)).catch((e) => e);
    expect(error).toBeInstanceOf(GameError);
    expect(error.code).toBe("NICKNAME_TAKEN");
    expect(error.details).toEqual({ suggestion: "KITSUNE 2" });
  });

  it("caps the room at 50 players", async () => {
    const { service, quiz } = setup();
    const { game_pin } = await service.createSession(quiz.id);
    await joinPlayers(service, game_pin, MAX_PLAYERS);
    expect(await service.getJoinInfo(game_pin)).toMatchObject({ joinable: false, reason: "full", playerCount: 50 });
    await expectCode(service.joinGame(game_pin, "Number 51", deviceToken(51)), "ROOM_FULL");
  });

  it("frees a slot when the host removes a player", async () => {
    const { service, quiz } = setup();
    const session = await service.createSession(quiz.id);
    const players = await joinPlayers(service, session.game_pin, MAX_PLAYERS);
    await host(service, session.id, "remove_player", { playerId: players[0].playerId });
    await expect(service.joinGame(session.game_pin, "Replacement", deviceToken(99))).resolves.toBeTruthy();
    await expectCode(service.joinGame(session.game_pin, "Kicked again", players[0].token), "KICKED");
    expect((await service.getPlayerView(players[0].playerId, players[0].token)).me.kicked).toBe(true);
    await expectCode(service.submitAnswer(players[0].playerId, players[0].token, "q", "c"), "KICKED");
  });

  it("blocks late joins unless the host enables them", async () => {
    const { service, quiz } = setup();
    const session = await service.createSession(quiz.id);
    await joinPlayers(service, session.game_pin, 1);
    await host(service, session.id, "start_game");
    await expectCode(service.joinGame(session.game_pin, "Latecomer", deviceToken(9)), "GAME_STARTED");
    await host(service, session.id, "update_settings", { settings: { allowLateJoin: true } });
    await expect(service.joinGame(session.game_pin, "Latecomer", deviceToken(9))).resolves.toBeTruthy();
  });

  it("blocks ended and expired games", async () => {
    const { service, quiz, clock } = setup();
    const ended = await service.createSession(quiz.id);
    await joinPlayers(service, ended.game_pin, 1);
    await host(service, ended.id, "end_game");
    await expectCode(service.joinGame(ended.game_pin, "Late", deviceToken(5)), "SESSION_ENDED");

    const expiring = await service.createSession(quiz.id);
    clock.advance(13 * 3600_000);
    expect((await service.getJoinInfo(expiring.game_pin)).reason).toBe("expired");
    await expectCode(service.joinGame(expiring.game_pin, "Late", deviceToken(6)), "SESSION_EXPIRED");
  });
});

describe("reconnecting", () => {
  it("restores the same player when the device rejoins", async () => {
    const { service, quiz } = setup();
    const session = await service.createSession(quiz.id);
    const [p] = await joinPlayers(service, session.game_pin, 1);
    await service.heartbeat(p.playerId, p.token, false);
    const again = await service.joinGame(session.game_pin, "Any other name", p.token);
    expect(again.restored).toBe(true);
    expect(again.player.id).toBe(p.playerId);
    expect(again.player.nickname).toBe(p.nickname);
    expect(again.player.connected).toBe(true);
  });

  it("rejects forged player credentials", async () => {
    const { service, quiz } = setup();
    const session = await service.createSession(quiz.id);
    const [p] = await joinPlayers(service, session.game_pin, 1);
    await expectCode(service.getPlayerView(p.playerId, deviceToken("attacker")), "UNAUTHORIZED");
    await expectCode(service.getPlayerView("not-a-uuid", p.token), "UNAUTHORIZED");
  });
});

describe("playing a question", () => {
  async function started(quiz = makeQuiz(), playerCount = 3) {
    const ctx = setup(quiz);
    const session = await ctx.service.createSession(ctx.quiz.id);
    const players = await joinPlayers(ctx.service, session.game_pin, playerCount);
    await host(ctx.service, session.id, "start_game");
    return { ...ctx, session, players };
  }

  it("requires at least one player to start", async () => {
    const { service, quiz } = setup();
    const session = await service.createSession(quiz.id);
    await expectCode(host(service, session.id, "start_game"), "NO_PLAYERS");
  });

  it("walks through ready → active → closed → results → leaderboard", async () => {
    const { service, session, players, quiz, clock } = await started();
    const q = quiz.questions[0];
    expect((await service.getHostView(session.id)).session.phase).toBe("ready");

    await host(service, session.id, "start_question");
    const live = await service.getHostView(session.id);
    expect(live.session.phase).toBe("active");
    expect(Date.parse(live.session.questionEndsAt!) - Date.parse(live.session.questionStartedAt!)).toBe(20_000);

    clock.advance(4000);
    await service.submitAnswer(players[0].playerId, players[0].token, q.id, correctChoice(q));
    expect((await service.getHostView(session.id)).answerCount).toBe(1);

    await host(service, session.id, "end_question");
    expect((await service.getHostView(session.id)).session.phase).toBe("closed");
    await host(service, session.id, "reveal");
    const results = await service.getHostView(session.id);
    expect(results.session.phase).toBe("results");
    expect(results.results).toMatchObject({ correctChoiceId: q.correct_choice_id, answeredCount: 1, correctCount: 1 });
    expect(results.results!.fastest?.playerId).toBe(players[0].playerId);

    await host(service, session.id, "show_leaderboard");
    const board = await service.getHostView(session.id);
    expect(board.session.phase).toBe("leaderboard");
    expect(board.leaderboard[0]).toMatchObject({ playerId: players[0].playerId, score: 900 });
  });

  it("scores on the server from server timestamps", async () => {
    const quiz = makeQuiz([makeQuestion({ multiplier: 2, timeLimitSeconds: 10 })]);
    const { service, session, players, clock } = await started(quiz);
    const q = quiz.questions[0];
    await host(service, session.id, "start_question");
    clock.advance(2500);
    const res = await service.submitAnswer(players[0].playerId, players[0].token, q.id, correctChoice(q));
    expect(res).toMatchObject({ accepted: true, duplicate: false, responseTimeMs: 2500 });
    clock.advance(1000);
    await service.submitAnswer(players[1].playerId, players[1].token, q.id, wrongChoice(q));
    await host(service, session.id, "end_question");
    await host(service, session.id, "reveal");

    const v0 = await service.getPlayerView(players[0].playerId, players[0].token);
    // (500 + 500 * (1 - 2.5 / 10)) * 2 = 1750
    expect(v0.result).toMatchObject({ answered: true, correct: true, pointsAwarded: 1750, wasFastest: true });
    expect(v0.me).toMatchObject({ score: 1750, streak: 1, rank: 1 });
    const v1 = await service.getPlayerView(players[1].playerId, players[1].token);
    expect(v1.result).toMatchObject({ answered: true, correct: false, pointsAwarded: 0 });
    const v2 = await service.getPlayerView(players[2].playerId, players[2].token);
    expect(v2.result).toMatchObject({ answered: false, correct: false, pointsAwarded: 0 });
  });

  it("accepts one answer per player and locks it", async () => {
    const { service, session, players, quiz } = await started();
    const q = quiz.questions[0];
    await host(service, session.id, "start_question");
    const first = await service.submitAnswer(players[0].playerId, players[0].token, q.id, wrongChoice(q));
    const second = await service.submitAnswer(players[0].playerId, players[0].token, q.id, correctChoice(q));
    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ duplicate: true, choiceId: wrongChoice(q) });
    expect((await service.getHostView(session.id)).answerCount).toBe(1);
  });

  it("never reveals the correct answer or scores before the reveal", async () => {
    const { service, session, players, quiz } = await started();
    const q = quiz.questions[0];
    await host(service, session.id, "start_question");
    await service.submitAnswer(players[0].playerId, players[0].token, q.id, correctChoice(q));
    await host(service, session.id, "end_question");

    const view = await service.getPlayerView(players[0].playerId, players[0].token);
    expect(view.question?.correctChoiceId).toBeNull();
    expect(view.question?.explanation).toBeNull();
    expect(view.result).toBeNull();
    expect(view.me.score).toBe(0);
    const hostView = await service.getHostView(session.id);
    expect(hostView.question?.correctChoiceId).toBeNull();
    expect(hostView.players.every((p) => p.score === 0)).toBe(true);
  });

  it("hides the question from phones unless mirroring is on", async () => {
    const { service, session, players, quiz } = await started();
    await host(service, session.id, "start_question");
    let view = await service.getPlayerView(players[0].playerId, players[0].token);
    expect(view.question?.prompt).toBe("");
    expect(view.question?.choices).toHaveLength(4);
    await host(service, session.id, "update_settings", { settings: { mirrorToPlayers: true } });
    view = await service.getPlayerView(players[0].playerId, players[0].token);
    expect(view.question?.prompt).toBe(quiz.questions[0].prompt);
  });

  it("rejects answers after the timer plus grace period", async () => {
    const { service, session, players, quiz, clock } = await started();
    const q = quiz.questions[0];
    await host(service, session.id, "start_question");

    clock.advance(20_000 + ANSWER_GRACE_MS - 10);
    const late = await service.submitAnswer(players[0].playerId, players[0].token, q.id, correctChoice(q));
    expect(late.responseTimeMs).toBe(20_000);

    clock.advance(20);
    await expectCode(service.submitAnswer(players[1].playerId, players[1].token, q.id, correctChoice(q)), "TIME_UP");
    expect((await service.getHostView(session.id)).session.phase).toBe("closed");
  });

  it("rejects answers for a different question or an invalid choice", async () => {
    const { service, session, players, quiz } = await started();
    const [q1, q2] = quiz.questions;
    await host(service, session.id, "start_question");
    await expectCode(service.submitAnswer(players[0].playerId, players[0].token, q2.id, correctChoice(q2)), "QUESTION_MISMATCH");
    await expectCode(service.submitAnswer(players[0].playerId, players[0].token, q1.id, correctChoice(q2)), "INVALID_CHOICE");
  });

  it("closes the question automatically once everyone has answered", async () => {
    const { service, session, players, quiz } = await started();
    const q = quiz.questions[0];
    await host(service, session.id, "start_question");
    for (const p of players) await service.submitAnswer(p.playerId, p.token, q.id, correctChoice(q));
    expect((await service.getHostView(session.id)).session.phase).toBe("closed");
    // A network retry from the last player still succeeds after the auto-close.
    const retry = await service.submitAnswer(players[2].playerId, players[2].token, q.id, correctChoice(q));
    expect(retry).toMatchObject({ accepted: true, duplicate: true });
  });

  it("pauses and resumes without counting the paused time", async () => {
    const { service, session, players, quiz, clock } = await started();
    const q = quiz.questions[0];
    await host(service, session.id, "start_question");
    clock.advance(5000);
    await host(service, session.id, "pause");
    const paused = await service.getHostView(session.id);
    expect(paused.session).toMatchObject({ phase: "paused", pausedRemainingMs: 15_000 });
    await expectCode(service.submitAnswer(players[0].playerId, players[0].token, q.id, correctChoice(q)), "PAUSED");

    clock.advance(60_000);
    await host(service, session.id, "resume");
    clock.advance(1000);
    const res = await service.submitAnswer(players[0].playerId, players[0].token, q.id, correctChoice(q));
    expect(res.responseTimeMs).toBe(6000);
  });

  it("rejects stale host actions so double clicks can't skip questions", async () => {
    const { service, session } = await started();
    const view = await service.getHostView(session.id);
    await service.hostAction(session.id, { action: "start_question", expectedVersion: view.session.stateVersion });
    await expectCode(service.hostAction(session.id, { action: "start_question", expectedVersion: view.session.stateVersion }), "VERSION_CONFLICT");
    await expectCode(host(service, session.id, "reveal"), "INVALID_PHASE");
  });

  it("skips a question without scoring it", async () => {
    const { service, session, players, quiz } = await started();
    const q = quiz.questions[0];
    await host(service, session.id, "start_question");
    await service.submitAnswer(players[0].playerId, players[0].token, q.id, correctChoice(q));
    await host(service, session.id, "skip_question");
    const view = await service.getHostView(session.id);
    expect(view.session).toMatchObject({ phase: "ready", questionIndex: 1 });
    expect(view.players.every((p) => p.score === 0)).toBe(true);
  });
});

describe("recovery and the final result", () => {
  it("recovers the full host state after a refresh / new server instance", async () => {
    const { service, store, quiz, clock } = setup();
    const session = await service.createSession(quiz.id);
    const players = await joinPlayers(service, session.game_pin, 2);
    await host(service, session.id, "start_game");
    await host(service, session.id, "start_question");
    await service.submitAnswer(players[0].playerId, players[0].token, quiz.questions[0].id, correctChoice(quiz.questions[0]));
    clock.advance(3000);

    const freshInstance = new GameService({ store, now: clock.now });
    const view = await freshInstance.getHostView(session.id);
    expect(view.session.phase).toBe("active");
    expect(view.answerCount).toBe(1);
    expect(view.players).toHaveLength(2);
    expect(Date.parse(view.session.questionEndsAt!) - clock.t).toBe(17_000);

    const playerView = await freshInstance.getPlayerView(players[0].playerId, players[0].token);
    expect(playerView.myAnswer?.choiceId).toBe(correctChoice(quiz.questions[0]));
  });

  it("crowns the champion with ties broken by response time", async () => {
    const quiz = makeQuiz([makeQuestion({ timeLimitSeconds: 10 }), makeQuestion({ timeLimitSeconds: 10 })]);
    const { service, clock } = setup(quiz);
    const session = await service.createSession(quiz.id);
    const [a, b, c] = await joinPlayers(service, session.game_pin, 3);
    await host(service, session.id, "start_game");

    // Q1: a answers at 2s, b at 4s. Q2: b at 2s, a at 4s → equal points, equal total time.
    // c answers both at 1s and 5s → same total time (6s) and same points: tie broken by join order.
    const plan: [typeof a, number][][] = [
      [[a, 2000], [b, 4000], [c, 1000]],
      [[b, 2000], [a, 4000], [c, 5000]],
    ];
    for (let i = 0; i < quiz.questions.length; i++) {
      const q = quiz.questions[i];
      await host(service, session.id, "start_question");
      const start = clock.t;
      for (const [p, at] of [...plan[i]].sort((x, y) => x[1] - y[1])) {
        clock.t = start + at;
        await service.submitAnswer(p.playerId, p.token, q.id, correctChoice(q));
      }
      await host(service, session.id, "reveal");
      await host(service, session.id, "show_leaderboard");
      await host(service, session.id, "next_question");
    }

    const final = await service.getHostView(session.id);
    expect(final.session.phase).toBe("final");
    expect(final.session.status).toBe("finished");
    const scores = final.podium.map((p) => p.score);
    expect(scores).toEqual([1700, 1700, 1700]);
    expect(final.podium.map((p) => p.playerId)).toEqual([a.playerId, b.playerId, c.playerId]);

    const winnerView = await service.getPlayerView(a.playerId, a.token);
    expect(winnerView.me).toMatchObject({ rank: 1, correctCount: 2, bestStreak: 2 });
    expect(winnerView.podium[0].playerId).toBe(a.playerId);
  });

  it("breaks equal scores in favour of the faster total response time", async () => {
    const { service, store, quiz } = setup();
    const session = await service.createSession(quiz.id);
    const [a, b] = await joinPlayers(service, session.game_pin, 2);
    await store.applyStandings(session.id, [
      { id: a.playerId, score: 1500, streak: 0, best_streak: 0, correct_answer_count: 2, total_correct_response_time: 9000, last_points: 0 },
      { id: b.playerId, score: 1500, streak: 0, best_streak: 0, correct_answer_count: 2, total_correct_response_time: 3000, last_points: 0 },
    ]);
    const view = await service.getHostView(session.id);
    expect(view.leaderboard.map((e) => e.playerId)).toEqual([b.playerId, a.playerId]);
  });

  it("ends early on request and can restart with a clean slate", async () => {
    const { service, quiz } = setup();
    const session = await service.createSession(quiz.id);
    const players = await joinPlayers(service, session.game_pin, 2);
    await host(service, session.id, "start_game");
    await host(service, session.id, "start_question");
    const q = quiz.questions[0];
    await service.submitAnswer(players[0].playerId, players[0].token, q.id, correctChoice(q));
    await host(service, session.id, "end_question");
    await host(service, session.id, "reveal");
    await host(service, session.id, "end_game");

    const ended = await service.getHostView(session.id);
    expect(ended.session.phase).toBe("final");
    expect(ended.podium[0].score).toBeGreaterThan(0);

    await host(service, session.id, "restart_game");
    const restarted = await service.getHostView(session.id);
    expect(restarted.session).toMatchObject({ phase: "lobby", status: "lobby", questionIndex: -1 });
    expect(restarted.players).toHaveLength(2);
    expect(restarted.players.every((p) => p.score === 0 && p.streak === 0)).toBe(true);
  });
});
