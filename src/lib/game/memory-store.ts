import { randomUUID } from "node:crypto";
import { MAX_PLAYERS } from "../constants";
import { nicknameKey } from "../nickname";
import { StoreConflictError } from "./errors";
import type { GameStore } from "./store";
import type {
  AnswerRow,
  NewPlayerRow,
  NewSessionRow,
  PlayerRow,
  QuestionRecord,
  QuizSummary,
  SessionPatch,
  SessionRow,
  StandingRow,
} from "./types";

export interface MemoryQuiz extends QuizSummary {
  questions: QuestionRecord[];
}

/**
 * In-memory GameStore used by unit tests and the offline simulation. It mirrors
 * the constraints enforced by the Postgres schema.
 */
export class MemoryGameStore implements GameStore {
  quizzes = new Map<string, MemoryQuiz>();
  sessions = new Map<string, SessionRow>();
  players = new Map<string, PlayerRow>();
  answers = new Map<string, AnswerRow>();
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  addQuiz(quiz: MemoryQuiz) {
    this.quizzes.set(quiz.id, structuredClone(quiz));
  }

  async getQuizSummary(quizId: string) {
    const quiz = this.quizzes.get(quizId);
    return quiz ? { id: quiz.id, title: quiz.title, subtitle: quiz.subtitle, status: quiz.status } : null;
  }

  async listQuizQuestionIds(quizId: string) {
    const quiz = this.quizzes.get(quizId);
    return quiz ? quiz.questions.map((q) => q.id) : [];
  }

  async getQuestions(ids: string[]) {
    const all = [...this.quizzes.values()].flatMap((q) => q.questions);
    return ids.map((id) => all.find((q) => q.id === id)).filter((q): q is QuestionRecord => !!q).map((q) => structuredClone(q));
  }

  async insertSession(row: NewSessionRow) {
    for (const s of this.sessions.values()) {
      if (s.game_pin === row.game_pin && s.status !== "finished") throw new StoreConflictError("PIN_TAKEN");
    }
    const session: SessionRow = {
      id: randomUUID(),
      quiz_id: row.quiz_id,
      game_pin: row.game_pin,
      status: "lobby",
      phase: "lobby",
      current_round_index: 0,
      current_question_index: -1,
      question_started_at: null,
      question_ends_at: null,
      paused_remaining_ms: null,
      show_results: false,
      question_order: [...row.question_order],
      revealed_question_ids: [],
      skipped_question_ids: [],
      allow_late_join: row.allow_late_join ?? false,
      mirror_to_players: row.mirror_to_players ?? false,
      max_players: Math.min(row.max_players ?? MAX_PLAYERS, MAX_PLAYERS),
      state_version: 0,
      created_at: new Date(this.now().getTime() + this.seq++).toISOString(),
      ended_at: null,
      expires_at: row.expires_at,
    };
    this.sessions.set(session.id, session);
    return structuredClone(session);
  }

  async getSession(id: string) {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : null;
  }

  async findLatestSessionByPin(pin: string) {
    const matches = [...this.sessions.values()]
      .filter((s) => s.game_pin === pin)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return matches[0] ? structuredClone(matches[0]) : null;
  }

  async updateSession(id: string, expectedVersion: number, patch: SessionPatch) {
    const current = this.sessions.get(id);
    if (!current || current.state_version !== expectedVersion) return null;
    const next = { ...current, ...structuredClone(patch), state_version: current.state_version + 1 } as SessionRow;
    if (next.status !== "finished" && next.game_pin) {
      for (const s of this.sessions.values()) {
        if (s.id !== id && s.game_pin === next.game_pin && s.status !== "finished") {
          throw new StoreConflictError("PIN_TAKEN");
        }
      }
    }
    this.sessions.set(id, next);
    return structuredClone(next);
  }

  async expireStaleSessions(now: Date) {
    for (const s of this.sessions.values()) {
      if (s.status !== "finished" && Date.parse(s.expires_at) < now.getTime()) {
        s.status = "finished";
        s.ended_at = now.toISOString();
        s.state_version += 1;
      }
    }
  }

  async listPlayers(sessionId: string) {
    return [...this.players.values()]
      .filter((p) => p.game_session_id === sessionId)
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .map((p) => structuredClone(p));
  }

  async getPlayer(id: string) {
    const p = this.players.get(id);
    return p ? structuredClone(p) : null;
  }

  async findPlayerByTokenHash(sessionId: string, tokenHash: string) {
    const p = [...this.players.values()].find((x) => x.game_session_id === sessionId && x.token_hash === tokenHash);
    return p ? structuredClone(p) : null;
  }

  async insertPlayer(row: NewPlayerRow) {
    const session = this.sessions.get(row.game_session_id);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    const inRoom = [...this.players.values()].filter((p) => p.game_session_id === row.game_session_id && !p.kicked);
    if (inRoom.length >= session.max_players) throw new StoreConflictError("ROOM_FULL");
    if (inRoom.some((p) => nicknameKey(p.nickname) === nicknameKey(row.nickname))) {
      throw new StoreConflictError("NICKNAME_TAKEN");
    }
    if ([...this.players.values()].some((p) => p.game_session_id === row.game_session_id && p.token_hash === row.token_hash)) {
      throw new StoreConflictError("TOKEN_TAKEN");
    }
    const player: PlayerRow = {
      ...row,
      score: 0,
      streak: 0,
      best_streak: 0,
      correct_answer_count: 0,
      total_correct_response_time: 0,
      last_points: 0,
      connected: true,
      kicked: false,
    };
    this.players.set(player.id, player);
    return structuredClone(player);
  }

  async updatePlayer(id: string, patch: Partial<Pick<PlayerRow, "connected" | "kicked" | "last_seen_at" | "nickname">>) {
    const p = this.players.get(id);
    if (p) Object.assign(p, patch);
  }

  async applyStandings(sessionId: string, rows: StandingRow[]) {
    for (const row of rows) {
      const p = this.players.get(row.id);
      if (p && p.game_session_id === sessionId) Object.assign(p, row);
    }
  }

  async insertAnswer(row: AnswerRow) {
    for (const a of this.answers.values()) {
      if (a.game_session_id === row.game_session_id && a.player_id === row.player_id && a.question_id === row.question_id) {
        return "duplicate" as const;
      }
    }
    this.answers.set(row.id, structuredClone(row));
    return "inserted" as const;
  }

  async getAnswer(sessionId: string, playerId: string, questionId: string) {
    const a = [...this.answers.values()].find(
      (x) => x.game_session_id === sessionId && x.player_id === playerId && x.question_id === questionId,
    );
    return a ? structuredClone(a) : null;
  }

  async listAnswers(sessionId: string, questionIds?: string[]) {
    return [...this.answers.values()]
      .filter((a) => a.game_session_id === sessionId && (!questionIds || questionIds.includes(a.question_id)))
      .map((a) => structuredClone(a));
  }

  async countAnswers(sessionId: string, questionId: string) {
    return [...this.answers.values()].filter((a) => a.game_session_id === sessionId && a.question_id === questionId).length;
  }

  async deleteSessionAnswers(sessionId: string) {
    for (const [id, a] of this.answers) if (a.game_session_id === sessionId) this.answers.delete(id);
  }
}
