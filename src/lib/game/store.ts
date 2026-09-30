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

/**
 * Persistence boundary for the game engine. Implementations must enforce the
 * same invariants as the database:
 *  - unique live PIN                              → StoreConflictError("PIN_TAKEN")
 *  - max_players per session                      → StoreConflictError("ROOM_FULL")
 *  - case-insensitive unique nickname (not kicked) → StoreConflictError("NICKNAME_TAKEN")
 *  - one answer per player per question           → insertAnswer returns "duplicate"
 *  - optimistic concurrency on sessions via state_version
 */
export interface GameStore {
  getQuizSummary(quizId: string): Promise<QuizSummary | null>;
  listQuizQuestionIds(quizId: string): Promise<string[]>;
  getQuestions(ids: string[]): Promise<QuestionRecord[]>;

  insertSession(row: NewSessionRow): Promise<SessionRow>;
  getSession(id: string): Promise<SessionRow | null>;
  findLatestSessionByPin(pin: string): Promise<SessionRow | null>;
  /** Applies the patch and increments state_version only if the version still matches. */
  updateSession(id: string, expectedVersion: number, patch: SessionPatch): Promise<SessionRow | null>;
  expireStaleSessions(now: Date): Promise<void>;

  listPlayers(sessionId: string): Promise<PlayerRow[]>;
  getPlayer(id: string): Promise<PlayerRow | null>;
  findPlayerByTokenHash(sessionId: string, tokenHash: string): Promise<PlayerRow | null>;
  insertPlayer(row: NewPlayerRow): Promise<PlayerRow>;
  updatePlayer(id: string, patch: Partial<Pick<PlayerRow, "connected" | "kicked" | "last_seen_at" | "nickname">>): Promise<void>;
  applyStandings(sessionId: string, rows: StandingRow[]): Promise<void>;

  insertAnswer(row: AnswerRow): Promise<"inserted" | "duplicate">;
  getAnswer(sessionId: string, playerId: string, questionId: string): Promise<AnswerRow | null>;
  listAnswers(sessionId: string, questionIds?: string[]): Promise<AnswerRow[]>;
  countAnswers(sessionId: string, questionId: string): Promise<number>;
  deleteSessionAnswers(sessionId: string): Promise<void>;
}
