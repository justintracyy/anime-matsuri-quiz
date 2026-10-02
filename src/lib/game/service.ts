import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ANSWER_GRACE_MS, SESSION_TTL_HOURS } from "../constants";
import { nicknameKey, nicknameSchema, suggestNickname } from "../nickname";
import { generatePin, isValidPin } from "../pin";
import { calculatePoints, computeStandings, rankPlayers, toLeaderboard } from "../scoring";
import { GameError, StoreConflictError } from "./errors";
import { effectivePhase, isRevealPhase } from "./phases";
import type { GameStore } from "./store";
import type {
  AnswerRow,
  GamePhase,
  HostView,
  JoinInfo,
  PlayerRow,
  PlayerView,
  PublicPlayerRow,
  QuestionRecord,
  QuestionResults,
  QuestionView,
  SessionPatch,
  SessionRow,
  SessionView,
} from "./types";

export const HOST_ACTIONS = [
  "start_game",
  "start_question",
  "pause",
  "resume",
  "end_question",
  "reveal",
  "show_leaderboard",
  "next_question",
  "skip_question",
  "remove_player",
  "end_game",
  "restart_game",
  "update_settings",
] as const;
export type HostAction = (typeof HOST_ACTIONS)[number];

export const hostActionSchema = z.object({
  action: z.enum(HOST_ACTIONS),
  expectedVersion: z.number().int().nonnegative().optional(),
  playerId: z.uuid().optional(),
  settings: z
    .object({
      allowLateJoin: z.boolean().optional(),
      mirrorToPlayers: z.boolean().optional(),
    })
    .optional(),
});
export type HostActionInput = z.infer<typeof hostActionSchema>;

export const deviceTokenSchema = z.string().min(16).max(200);

export interface GameServiceOptions {
  store: GameStore;
  now?: () => Date;
  pinGenerator?: () => string;
  idGenerator?: () => string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

function toPublicPlayer({ token_hash: _hidden, ...rest }: PlayerRow): PublicPlayerRow {
  return rest;
}

export class GameService {
  private readonly store: GameStore;
  private readonly now: () => Date;
  private readonly pinGenerator: () => string;
  private readonly idGenerator: () => string;

  constructor(options: GameServiceOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => new Date());
    this.pinGenerator = options.pinGenerator ?? (() => generatePin());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  // ─────────────────────────────── Sessions ───────────────────────────────

  async createSession(
    quizId: string,
    options: { allowLateJoin?: boolean; mirrorToPlayers?: boolean } = {},
  ): Promise<SessionRow> {
    const quiz = await this.store.getQuizSummary(quizId);
    if (!quiz) throw new GameError("NOT_FOUND", "Quiz not found.");
    if (quiz.status !== "published") {
      throw new GameError("QUIZ_NOT_PUBLISHED", "Publish the quiz before hosting a live game.");
    }
    const questionOrder = await this.store.listQuizQuestionIds(quizId);
    if (questionOrder.length === 0) throw new GameError("QUIZ_EMPTY", "Add at least one question before hosting.");

    const now = this.now();
    await this.store.expireStaleSessions(now);
    const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 3600_000).toISOString();

    for (let attempt = 0; attempt < 20; attempt++) {
      const pin = this.pinGenerator();
      try {
        return await this.store.insertSession({
          quiz_id: quizId,
          game_pin: pin,
          question_order: questionOrder,
          expires_at: expiresAt,
          allow_late_join: options.allowLateJoin ?? false,
          mirror_to_players: options.mirrorToPlayers ?? false,
        });
      } catch (error) {
        if (error instanceof StoreConflictError && error.kind === "PIN_TAKEN") continue;
        throw error;
      }
    }
    throw new GameError("INTERNAL", "Could not allocate a unique game PIN. Please try again.");
  }

  async getJoinInfo(pin: string): Promise<JoinInfo> {
    const session = await this.requireSessionByPin(pin);
    const [quiz, players] = await Promise.all([
      this.store.getQuizSummary(session.quiz_id),
      this.store.listPlayers(session.id),
    ]);
    const playerCount = players.filter((p) => !p.kicked).length;
    const reason = this.joinBlockReason(session, playerCount);
    return {
      sessionId: session.id,
      pin: session.game_pin,
      quizTitle: quiz?.title ?? "Anime Quiz",
      status: session.status,
      phase: session.phase,
      playerCount,
      maxPlayers: session.max_players,
      joinable: reason === "ok",
      reason,
    };
  }

  private joinBlockReason(session: SessionRow, playerCount: number): JoinInfo["reason"] {
    if (session.status === "finished") return "ended";
    if (Date.parse(session.expires_at) < this.now().getTime()) return "expired";
    if (session.status !== "lobby" && !session.allow_late_join) return "started";
    if (playerCount >= session.max_players) return "full";
    return "ok";
  }

  // ─────────────────────────────── Players ───────────────────────────────

  async joinGame(
    pin: string,
    rawNickname: string,
    deviceToken: string,
  ): Promise<{ player: PublicPlayerRow; session: SessionView; restored: boolean }> {
    const nickname = nicknameSchema.safeParse(rawNickname);
    if (!nickname.success) throw new GameError("VALIDATION", nickname.error.issues[0]?.message ?? "Invalid nickname.");
    if (!deviceTokenSchema.safeParse(deviceToken).success) throw new GameError("VALIDATION", "Invalid device token.");

    const session = await this.requireSessionByPin(pin);
    const tokenHash = hashToken(deviceToken);
    const nowIso = this.now().toISOString();

    // Reconnect: the same device (token) gets its existing player back.
    const existing = await this.store.findPlayerByTokenHash(session.id, tokenHash);
    if (existing) {
      if (existing.kicked) throw new GameError("KICKED", "The host removed you from this game.");
      if (session.status === "finished") {
        return { player: toPublicPlayer(existing), session: this.toSessionView(session), restored: true };
      }
      await this.store.updatePlayer(existing.id, { connected: true, last_seen_at: nowIso });
      return {
        player: toPublicPlayer({ ...existing, connected: true, last_seen_at: nowIso }),
        session: this.toSessionView(session),
        restored: true,
      };
    }

    const players = await this.store.listPlayers(session.id);
    const active = players.filter((p) => !p.kicked);
    const reason = this.joinBlockReason(session, active.length);
    if (reason === "ended") throw new GameError("SESSION_ENDED", "This game has ended.");
    if (reason === "expired") throw new GameError("SESSION_EXPIRED", "This game PIN has expired.");
    if (reason === "started") {
      throw new GameError("GAME_STARTED", "This game has already started. Ask the host to enable late joining.");
    }
    if (reason === "full") throw new GameError("ROOM_FULL", `This game is full (${session.max_players} players).`);

    if (active.some((p) => nicknameKey(p.nickname) === nicknameKey(nickname.data))) {
      throw this.nicknameTaken(nickname.data, active);
    }

    try {
      const player = await this.store.insertPlayer({
        id: this.idGenerator(),
        game_session_id: session.id,
        nickname: nickname.data,
        token_hash: tokenHash,
        joined_at: nowIso,
        last_seen_at: nowIso,
      });
      return { player: toPublicPlayer(player), session: this.toSessionView(session), restored: false };
    } catch (error) {
      if (error instanceof StoreConflictError) {
        if (error.kind === "ROOM_FULL") throw new GameError("ROOM_FULL", `This game is full (${session.max_players} players).`);
        if (error.kind === "NICKNAME_TAKEN") {
          throw this.nicknameTaken(nickname.data, await this.store.listPlayers(session.id));
        }
        if (error.kind === "TOKEN_TAKEN") return this.joinGame(pin, rawNickname, deviceToken);
      }
      throw error;
    }
  }

  private nicknameTaken(nickname: string, players: PlayerRow[]): GameError {
    const suggestion = suggestNickname(nickname, players.filter((p) => !p.kicked).map((p) => p.nickname));
    return new GameError("NICKNAME_TAKEN", `"${nickname}" is already taken. Try "${suggestion}".`, { suggestion });
  }

  async authenticatePlayer(playerId: string, deviceToken: string): Promise<{ player: PlayerRow; session: SessionRow }> {
    if (!z.uuid().safeParse(playerId).success || !deviceTokenSchema.safeParse(deviceToken).success) {
      throw new GameError("UNAUTHORIZED", "Your player session is invalid. Please join again.");
    }
    const player = await this.store.getPlayer(playerId);
    if (!player || !safeEqualHex(player.token_hash, hashToken(deviceToken))) {
      throw new GameError("UNAUTHORIZED", "Your player session is invalid. Please join again.");
    }
    const session = await this.store.getSession(player.game_session_id);
    if (!session) throw new GameError("NOT_FOUND", "This game no longer exists.");
    return { player, session };
  }

  async heartbeat(playerId: string, deviceToken: string, connected = true) {
    const { player, session } = await this.authenticatePlayer(playerId, deviceToken);
    if (!player.kicked) {
      await this.store.updatePlayer(player.id, { connected, last_seen_at: this.now().toISOString() });
    }
    return {
      serverNow: this.now().getTime(),
      stateVersion: session.state_version,
      phase: effectivePhase(session, this.now().getTime()),
      kicked: player.kicked,
    };
  }

  async getPlayerView(playerId: string, deviceToken: string): Promise<PlayerView> {
    const { player, session } = await this.authenticatePlayer(playerId, deviceToken);
    const nowMs = this.now().getTime();
    const phase = effectivePhase(session, nowMs);
    const [quiz, players, record] = await Promise.all([
      this.store.getQuizSummary(session.quiz_id),
      this.store.listPlayers(session.id),
      this.currentQuestion(session),
    ]);
    const ranked = rankPlayers(players);
    const myRank = ranked.find((p) => p.id === player.id)?.rank ?? null;
    const revealed = !!record && session.revealed_question_ids.includes(record.id);

    let question: QuestionView | null = null;
    let myAnswer: PlayerView["myAnswer"] = null;
    let result: PlayerView["result"] = null;

    if (record && phase !== "lobby" && phase !== "final") {
      const previous = session.current_question_index > 0 ? session.question_order[session.current_question_index - 1] : null;
      question = this.toQuestionView(record, session, phase, {
        audience: "player",
        revealed,
        isNewRound: await this.isNewRound(record, previous),
      });
      const answer = await this.store.getAnswer(session.id, player.id, record.id);
      if (answer) myAnswer = { choiceId: answer.selected_choice_id, responseTimeMs: answer.response_time_ms };
      if (revealed) {
        const answers = await this.store.listAnswers(session.id, [record.id]);
        const fastest = this.fastestCorrect(answers, players);
        result = {
          answered: !!answer,
          correct: !!answer?.is_correct,
          selectedChoiceId: answer?.selected_choice_id ?? null,
          correctChoiceId: record.correct_choice_id,
          pointsAwarded: answer?.is_correct ? answer.points_awarded : 0,
          responseTimeMs: answer?.response_time_ms ?? null,
          wasFastest: fastest?.playerId === player.id,
        };
      }
    }

    return {
      serverNow: nowMs,
      session: this.toSessionView(session, phase),
      quizTitle: quiz?.title ?? "Anime Quiz",
      me: {
        id: player.id,
        nickname: player.nickname,
        score: player.score,
        streak: player.streak,
        bestStreak: player.best_streak,
        correctCount: player.correct_answer_count,
        rank: myRank,
        playerCount: ranked.length,
        kicked: player.kicked,
      },
      question,
      myAnswer,
      result,
      podium: phase === "final" ? toLeaderboard(players.map(toPublicPlayer), 3) : [],
    };
  }

  async submitAnswer(
    playerId: string,
    deviceToken: string,
    questionId: string,
    choiceId: string,
  ): Promise<{ accepted: true; duplicate: boolean; choiceId: string | null; responseTimeMs: number }> {
    const { player, session } = await this.authenticatePlayer(playerId, deviceToken);
    if (player.kicked) throw new GameError("KICKED", "The host removed you from this game.");

    // Retries of an accepted answer stay successful even after the question closes.
    const previous = await this.store.getAnswer(session.id, player.id, questionId);
    if (previous) {
      return { accepted: true, duplicate: true, choiceId: previous.selected_choice_id, responseTimeMs: previous.response_time_ms };
    }

    const now = this.now();
    const nowMs = now.getTime();
    if (session.phase === "paused") throw new GameError("PAUSED", "The host paused the timer. Hold on!");
    if (session.phase !== "active") throw new GameError("TIME_UP", "This question is closed.");

    const currentId = session.question_order[session.current_question_index];
    if (!currentId || currentId !== questionId) {
      throw new GameError("QUESTION_MISMATCH", "That question is no longer active.");
    }
    if (!session.question_started_at || !session.question_ends_at) throw new GameError("TIME_UP", "This question is closed.");
    if (nowMs > Date.parse(session.question_ends_at) + ANSWER_GRACE_MS) throw new GameError("TIME_UP", "Time's up!");

    const [record] = await this.store.getQuestions([questionId]);
    if (!record) throw new GameError("NOT_FOUND", "Question not found.");
    if (!record.choices.some((c) => c.id === choiceId)) throw new GameError("INVALID_CHOICE", "That is not a valid answer.");

    const timeLimitMs = record.time_limit_seconds * 1000;
    const responseTimeMs = Math.min(Math.max(0, nowMs - Date.parse(session.question_started_at)), timeLimitMs);
    const isCorrect = record.correct_choice_id !== null && choiceId === record.correct_choice_id;
    const pointsAwarded = calculatePoints({
      isCorrect,
      responseTimeMs,
      timeLimitMs,
      multiplier: record.multiplier,
      basePoints: record.base_points,
    });

    const outcome = await this.store.insertAnswer({
      id: this.idGenerator(),
      game_session_id: session.id,
      player_id: player.id,
      question_id: questionId,
      selected_choice_id: choiceId,
      is_correct: isCorrect,
      submitted_at: now.toISOString(),
      response_time_ms: responseTimeMs,
      points_awarded: pointsAwarded,
    });

    if (outcome === "duplicate") {
      const existing = await this.store.getAnswer(session.id, player.id, questionId);
      return {
        accepted: true,
        duplicate: true,
        choiceId: existing?.selected_choice_id ?? null,
        responseTimeMs: existing?.response_time_ms ?? responseTimeMs,
      };
    }

    await this.closeIfEveryoneAnswered(session.id, questionId);
    return { accepted: true, duplicate: false, choiceId, responseTimeMs };
  }

  private async closeIfEveryoneAnswered(sessionId: string, questionId: string) {
    const [session, players, count] = await Promise.all([
      this.store.getSession(sessionId),
      this.store.listPlayers(sessionId),
      this.store.countAnswers(sessionId, questionId),
    ]);
    if (!session || session.phase !== "active") return;
    const active = players.filter((p) => !p.kicked).length;
    if (active > 0 && count >= active) {
      await this.store.updateSession(session.id, session.state_version, {
        phase: "closed",
        question_ends_at: this.now().toISOString(),
        paused_remaining_ms: null,
      });
    }
  }

  // ─────────────────────────────── Host ───────────────────────────────

  async getHostView(sessionId: string): Promise<HostView> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new GameError("NOT_FOUND", "Game session not found.");
    const nowMs = this.now().getTime();
    const phase = effectivePhase(session, nowMs);

    const [quiz, players, record] = await Promise.all([
      this.store.getQuizSummary(session.quiz_id),
      this.store.listPlayers(session.id),
      this.currentQuestion(session),
    ]);
    const publicPlayers = players.map(toPublicPlayer);
    const ranks = new Map(rankPlayers(publicPlayers).map((p) => [p.id, p.rank]));
    const revealed = !!record && session.revealed_question_ids.includes(record.id);

    let question: QuestionView | null = null;
    let answerCount = 0;
    let results: QuestionResults | null = null;
    if (record && phase !== "lobby" && phase !== "final") {
      const previous = session.current_question_index > 0 ? session.question_order[session.current_question_index - 1] : null;
      question = this.toQuestionView(record, session, phase, {
        audience: "host",
        revealed,
        isNewRound: await this.isNewRound(record, previous),
      });
      const answers = await this.store.listAnswers(session.id, [record.id]);
      answerCount = answers.length;
      if (revealed) results = this.buildResults(record, answers, players);
    }

    let nextQuestion: HostView["nextQuestion"] = null;
    const nextId = session.question_order[session.current_question_index + 1];
    if (nextId && phase !== "final") {
      const [next] = await this.store.getQuestions([nextId]);
      if (next) nextQuestion = { index: session.current_question_index + 1, roundTitle: next.round_title, type: next.type };
    }

    return {
      serverNow: nowMs,
      session: this.toSessionView(session, phase),
      quiz: { id: session.quiz_id, title: quiz?.title ?? "Anime Quiz", subtitle: quiz?.subtitle ?? null },
      players: publicPlayers.map((p) => ({ ...p, rank: ranks.get(p.id) ?? null })),
      activePlayerCount: publicPlayers.filter((p) => !p.kicked).length,
      question,
      nextQuestion,
      answerCount,
      results,
      leaderboard: toLeaderboard(publicPlayers, 5),
      podium: toLeaderboard(publicPlayers, 3),
    };
  }

  /** Every file the host screen can show in this game, in play order, so it can be downloaded ahead of time. */
  async getSessionMedia(sessionId: string): Promise<{ kind: "image" | "audio"; path: string }[]> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new GameError("NOT_FOUND", "Game session not found.");
    const records = await this.store.getQuestions(session.question_order);
    const media: { kind: "image" | "audio"; path: string }[] = [];
    const seen = new Set<string>();
    const add = (kind: "image" | "audio", path: string | null) => {
      if (!path || seen.has(path)) return;
      seen.add(path);
      media.push({ kind, path });
    };
    for (const r of records) {
      add("audio", r.audio_path);
      add("image", r.media_path);
      add("image", r.original_media_path);
    }
    return media;
  }

  async hostAction(sessionId: string, input: HostActionInput): Promise<SessionRow> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new GameError("NOT_FOUND", "Game session not found.");
    if (input.expectedVersion !== undefined && input.expectedVersion !== session.state_version) {
      throw new GameError("VERSION_CONFLICT", "The game changed on another screen. Refreshing…");
    }

    const now = this.now();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();
    const phase = effectivePhase(session, nowMs);
    const require = (...allowed: GamePhase[]) => {
      if (!allowed.includes(phase)) {
        throw new GameError("INVALID_PHASE", `“${input.action.replace(/_/g, " ")}” is not available right now.`);
      }
    };

    switch (input.action) {
      case "start_game": {
        require("lobby");
        const players = await this.store.listPlayers(session.id);
        if (!players.some((p) => !p.kicked)) throw new GameError("NO_PLAYERS", "Wait for at least one player to join.");
        const order = await this.store.listQuizQuestionIds(session.quiz_id);
        if (order.length === 0) throw new GameError("QUIZ_EMPTY", "This quiz has no questions.");
        const [first] = await this.store.getQuestions([order[0]]);
        return this.commit(session, {
          status: "in_progress",
          phase: "ready",
          question_order: order,
          current_question_index: 0,
          current_round_index: first?.round_position ?? 0,
          question_started_at: null,
          question_ends_at: null,
          paused_remaining_ms: null,
          show_results: false,
          revealed_question_ids: [],
          skipped_question_ids: [],
        });
      }

      case "start_question": {
        require("ready");
        const record = await this.requireCurrentQuestion(session);
        return this.commit(session, {
          phase: "active",
          question_started_at: nowIso,
          question_ends_at: new Date(nowMs + record.time_limit_seconds * 1000).toISOString(),
          paused_remaining_ms: null,
          show_results: false,
        });
      }

      case "pause": {
        require("active");
        const remaining = Math.max(0, Date.parse(session.question_ends_at!) - nowMs);
        return this.commit(session, { phase: "paused", paused_remaining_ms: remaining });
      }

      case "resume": {
        require("paused");
        const record = await this.requireCurrentQuestion(session);
        const limitMs = record.time_limit_seconds * 1000;
        const remaining = Math.max(1000, session.paused_remaining_ms ?? 0);
        return this.commit(session, {
          phase: "active",
          // Shift the start so response times exclude the paused period.
          question_started_at: new Date(nowMs - (limitMs - remaining)).toISOString(),
          question_ends_at: new Date(nowMs + remaining).toISOString(),
          paused_remaining_ms: null,
        });
      }

      case "end_question": {
        require("active", "paused", "closed");
        if (session.phase === "closed") return session;
        const endsAt = session.question_ends_at && Date.parse(session.question_ends_at) < nowMs ? session.question_ends_at : nowIso;
        return this.commit(session, { phase: "closed", question_ends_at: endsAt, paused_remaining_ms: null });
      }

      case "reveal": {
        require("closed");
        const record = await this.requireCurrentQuestion(session);
        const revealedIds = [...new Set([...session.revealed_question_ids, record.id])];
        // Write scores first so players who refetch on the phase change see final numbers.
        await this.refreshStandings({ ...session, revealed_question_ids: revealedIds });
        try {
          return await this.commit(session, {
            phase: "results",
            show_results: true,
            revealed_question_ids: revealedIds,
            paused_remaining_ms: null,
          });
        } catch (error) {
          const fresh = await this.store.getSession(session.id);
          if (fresh) await this.refreshStandings(fresh);
          throw error;
        }
      }

      case "show_leaderboard": {
        require("results");
        const updated = await this.commit(session, { phase: "leaderboard", show_results: true });
        await this.refreshStandings(updated);
        return updated;
      }

      case "next_question": {
        require("results", "leaderboard");
        return this.advance(session, {});
      }

      case "skip_question": {
        require("ready", "active", "paused", "closed");
        const currentId = session.question_order[session.current_question_index];
        return this.advance(session, {
          skipped_question_ids: currentId ? [...new Set([...session.skipped_question_ids, currentId])] : session.skipped_question_ids,
        });
      }

      case "end_game": {
        if (phase === "final") return session;
        const updated = await this.finish(session, {});
        return updated;
      }

      case "restart_game": {
        await this.store.deleteSessionAnswers(session.id);
        const players = await this.store.listPlayers(session.id);
        await this.store.applyStandings(session.id, computeStandings(players, [], []));
        const order = await this.store.listQuizQuestionIds(session.quiz_id);
        const patch: SessionPatch = {
          status: "lobby",
          phase: "lobby",
          current_question_index: -1,
          current_round_index: 0,
          question_started_at: null,
          question_ends_at: null,
          paused_remaining_ms: null,
          show_results: false,
          revealed_question_ids: [],
          skipped_question_ids: [],
          question_order: order.length ? order : session.question_order,
          ended_at: null,
          expires_at: new Date(nowMs + SESSION_TTL_HOURS * 3600_000).toISOString(),
        };
        try {
          return await this.commit(session, patch);
        } catch (error) {
          if (!(error instanceof StoreConflictError && error.kind === "PIN_TAKEN")) throw error;
          // The PIN was reused by another live game while this one was finished.
          for (let attempt = 0; attempt < 20; attempt++) {
            try {
              return await this.commit(session, { ...patch, game_pin: this.pinGenerator() });
            } catch (retryError) {
              if (!(retryError instanceof StoreConflictError && retryError.kind === "PIN_TAKEN")) throw retryError;
            }
          }
          throw new GameError("INTERNAL", "Could not allocate a new PIN for the restarted game.");
        }
      }

      case "remove_player": {
        if (!input.playerId) throw new GameError("VALIDATION", "playerId is required.");
        const player = await this.store.getPlayer(input.playerId);
        if (!player || player.game_session_id !== session.id) throw new GameError("NOT_FOUND", "Player not found.");
        await this.store.updatePlayer(player.id, { kicked: true, connected: false });
        return session;
      }

      case "update_settings": {
        const patch: SessionPatch = {};
        if (input.settings?.allowLateJoin !== undefined) patch.allow_late_join = input.settings.allowLateJoin;
        if (input.settings?.mirrorToPlayers !== undefined) patch.mirror_to_players = input.settings.mirrorToPlayers;
        if (Object.keys(patch).length === 0) return session;
        return this.commit(session, patch);
      }
    }
  }

  // ─────────────────────────────── Internals ───────────────────────────────

  private async commit(session: SessionRow, patch: SessionPatch): Promise<SessionRow> {
    const updated = await this.store.updateSession(session.id, session.state_version, patch);
    if (!updated) throw new GameError("VERSION_CONFLICT", "The game changed on another screen. Refreshing…");
    return updated;
  }

  private async advance(session: SessionRow, extra: SessionPatch): Promise<SessionRow> {
    const nextIndex = session.current_question_index + 1;
    if (nextIndex >= session.question_order.length) return this.finish(session, extra);
    const [next] = await this.store.getQuestions([session.question_order[nextIndex]]);
    return this.commit(session, {
      ...extra,
      phase: "ready",
      current_question_index: nextIndex,
      current_round_index: next?.round_position ?? session.current_round_index,
      question_started_at: null,
      question_ends_at: null,
      paused_remaining_ms: null,
      show_results: false,
    });
  }

  private async finish(session: SessionRow, extra: SessionPatch): Promise<SessionRow> {
    const updated = await this.commit(session, {
      ...extra,
      status: "finished",
      phase: "final",
      show_results: true,
      paused_remaining_ms: null,
      ended_at: this.now().toISOString(),
    });
    await this.refreshStandings(updated);
    return updated;
  }

  /** Recompute all totals from stored answers for the revealed questions (idempotent). */
  private async refreshStandings(session: SessionRow) {
    const counted = session.question_order.filter(
      (id) => session.revealed_question_ids.includes(id) && !session.skipped_question_ids.includes(id),
    );
    const [players, answers] = await Promise.all([
      this.store.listPlayers(session.id),
      this.store.listAnswers(session.id, counted),
    ]);
    await this.store.applyStandings(session.id, computeStandings(players, answers, counted));
  }

  private async requireSessionByPin(pin: string): Promise<SessionRow> {
    if (!isValidPin(pin)) throw new GameError("PIN_NOT_FOUND", "That game PIN doesn't look right. It should be 6 digits.");
    const session = await this.store.findLatestSessionByPin(pin);
    if (!session) throw new GameError("PIN_NOT_FOUND", "No game found with that PIN.");
    return session;
  }

  private async currentQuestion(session: SessionRow): Promise<QuestionRecord | null> {
    const id = session.question_order[session.current_question_index];
    if (!id) return null;
    const [record] = await this.store.getQuestions([id]);
    return record ?? null;
  }

  private async requireCurrentQuestion(session: SessionRow): Promise<QuestionRecord> {
    const record = await this.currentQuestion(session);
    if (!record) throw new GameError("NOT_FOUND", "The current question no longer exists. Skip it to continue.");
    return record;
  }

  private async isNewRound(record: QuestionRecord, previousId: string | null | undefined): Promise<boolean> {
    if (!previousId) return true;
    const [previous] = await this.store.getQuestions([previousId]);
    return !previous || previous.round_id !== record.round_id;
  }

  private fastestCorrect(answers: AnswerRow[], players: PlayerRow[]) {
    const active = new Map(players.filter((p) => !p.kicked).map((p) => [p.id, p]));
    const fastest = answers
      .filter((a) => a.is_correct && active.has(a.player_id))
      .sort((a, b) => a.response_time_ms - b.response_time_ms || a.submitted_at.localeCompare(b.submitted_at))[0];
    if (!fastest) return null;
    return {
      playerId: fastest.player_id,
      nickname: active.get(fastest.player_id)!.nickname,
      responseTimeMs: fastest.response_time_ms,
    };
  }

  private buildResults(record: QuestionRecord, answers: AnswerRow[], players: PlayerRow[]): QuestionResults {
    const kicked = new Set(players.filter((p) => p.kicked).map((p) => p.id));
    const counted = answers.filter((a) => !kicked.has(a.player_id));
    const distribution: Record<string, number> = Object.fromEntries(record.choices.map((c) => [c.id, 0]));
    for (const a of counted) {
      if (a.selected_choice_id && a.selected_choice_id in distribution) distribution[a.selected_choice_id] += 1;
    }
    return {
      questionId: record.id,
      correctChoiceId: record.correct_choice_id,
      distribution,
      answeredCount: counted.length,
      correctCount: counted.filter((a) => a.is_correct).length,
      fastest: this.fastestCorrect(counted, players),
    };
  }

  private toSessionView(session: SessionRow, phase: GamePhase = effectivePhase(session, this.now().getTime())): SessionView {
    return {
      id: session.id,
      pin: session.game_pin,
      status: session.status,
      phase,
      stateVersion: session.state_version,
      questionIndex: session.current_question_index,
      roundIndex: session.current_round_index,
      totalQuestions: session.question_order.length,
      questionStartedAt: session.question_started_at,
      questionEndsAt: session.question_ends_at,
      pausedRemainingMs: session.paused_remaining_ms,
      allowLateJoin: session.allow_late_join,
      mirrorToPlayers: session.mirror_to_players,
      maxPlayers: session.max_players,
      expiresAt: session.expires_at,
    };
  }

  private toQuestionView(
    record: QuestionRecord,
    session: SessionRow,
    phase: GamePhase,
    opts: { audience: "host" | "player"; revealed: boolean; isNewRound: boolean },
  ): QuestionView {
    const showContent = opts.audience === "host" || session.mirror_to_players;
    const live = phase === "active" || phase === "paused" || phase === "closed";
    const showMedia = showContent && (live || isRevealPhase(phase));
    const showChoices = phase !== "ready";
    const imagePath = opts.revealed ? (record.original_media_path ?? record.media_path) : record.media_path;

    return {
      id: record.id,
      index: session.current_question_index,
      type: record.type,
      prompt: showContent ? record.prompt : "",
      roundTitle: record.round_title,
      roundIndex: record.round_position,
      isNewRound: opts.isNewRound,
      timeLimitSeconds: record.time_limit_seconds,
      multiplier: record.multiplier,
      choices: showChoices ? record.choices.map(({ id, label, text }) => ({ id, label, text })) : [],
      image: showMedia && imagePath ? { path: imagePath } : null,
      audio:
        showMedia && record.audio_path
          ? {
              path: record.audio_path,
              startSeconds: Number(record.audio_start_seconds) || 0,
              durationSeconds: record.audio_duration_seconds === null ? null : Number(record.audio_duration_seconds),
              allowReplay: record.allow_audio_replay,
            }
          : null,
      correctChoiceId: opts.revealed ? record.correct_choice_id : null,
      explanation: opts.revealed ? record.explanation : null,
    };
  }
}
