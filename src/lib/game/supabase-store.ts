import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { ChoiceLabel, QuestionType } from "../constants";
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

const UNIQUE_VIOLATION = "23505";

function fail(error: PostgrestError, context: string): never {
  throw new Error(`${context}: ${error.message}${error.details ? ` (${error.details})` : ""}`);
}

interface QuestionJoinRow {
  id: string;
  round_id: string;
  type: QuestionType;
  prompt: string;
  correct_choice_id: string | null;
  time_limit_seconds: number;
  base_points: number;
  multiplier: number;
  explanation: string | null;
  position: number;
  media_path: string | null;
  original_media_path: string | null;
  audio_path: string | null;
  audio_start_seconds: number | string;
  audio_duration_seconds: number | string | null;
  allow_audio_replay: boolean;
  rounds: { title: string; position: number; quiz_id: string } | null;
  choices: { id: string; label: ChoiceLabel; text: string; position: number }[];
}

function toQuestionRecord(row: QuestionJoinRow): QuestionRecord {
  return {
    id: row.id,
    round_id: row.round_id,
    round_title: row.rounds?.title ?? "",
    round_position: row.rounds?.position ?? 0,
    type: row.type,
    prompt: row.prompt,
    correct_choice_id: row.correct_choice_id,
    time_limit_seconds: row.time_limit_seconds,
    base_points: row.base_points,
    multiplier: row.multiplier,
    explanation: row.explanation,
    media_path: row.media_path,
    original_media_path: row.original_media_path,
    audio_path: row.audio_path,
    audio_start_seconds: Number(row.audio_start_seconds) || 0,
    audio_duration_seconds: row.audio_duration_seconds === null ? null : Number(row.audio_duration_seconds),
    allow_audio_replay: row.allow_audio_replay,
    choices: [...(row.choices ?? [])].sort((a, b) => a.position - b.position),
  };
}

export class SupabaseGameStore implements GameStore {
  constructor(private readonly db: SupabaseClient) {}

  async getQuizSummary(quizId: string): Promise<QuizSummary | null> {
    const { data, error } = await this.db.from("quizzes").select("id, title, subtitle, status").eq("id", quizId).maybeSingle();
    if (error) fail(error, "getQuizSummary");
    return data as QuizSummary | null;
  }

  async listQuizQuestionIds(quizId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from("rounds")
      .select("position, questions(id, position)")
      .eq("quiz_id", quizId)
      .order("position", { ascending: true });
    if (error) fail(error, "listQuizQuestionIds");
    return (data as { position: number; questions: { id: string; position: number }[] }[]).flatMap((round) =>
      [...round.questions].sort((a, b) => a.position - b.position).map((q) => q.id),
    );
  }

  async getQuestions(ids: string[]): Promise<QuestionRecord[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.db
      .from("questions")
      .select("*, rounds(title, position, quiz_id), choices!choices_question_id_fkey(id, label, text, position)")
      .in("id", ids);
    if (error) fail(error, "getQuestions");
    const byId = new Map((data as QuestionJoinRow[]).map((row) => [row.id, toQuestionRecord(row)]));
    return ids.map((id) => byId.get(id)).filter((q): q is QuestionRecord => !!q);
  }

  async insertSession(row: NewSessionRow): Promise<SessionRow> {
    const { data, error } = await this.db.from("game_sessions").insert(row).select("*").single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new StoreConflictError("PIN_TAKEN");
      fail(error, "insertSession");
    }
    return data as SessionRow;
  }

  async getSession(id: string): Promise<SessionRow | null> {
    const { data, error } = await this.db.from("game_sessions").select("*").eq("id", id).maybeSingle();
    if (error) fail(error, "getSession");
    return data as SessionRow | null;
  }

  async findLatestSessionByPin(pin: string): Promise<SessionRow | null> {
    const { data, error } = await this.db
      .from("game_sessions")
      .select("*")
      .eq("game_pin", pin)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail(error, "findLatestSessionByPin");
    return data as SessionRow | null;
  }

  async updateSession(id: string, expectedVersion: number, patch: SessionPatch): Promise<SessionRow | null> {
    const { data, error } = await this.db
      .from("game_sessions")
      .update({ ...patch, state_version: expectedVersion + 1 })
      .eq("id", id)
      .eq("state_version", expectedVersion)
      .select("*")
      .maybeSingle();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new StoreConflictError("PIN_TAKEN");
      fail(error, "updateSession");
    }
    return data as SessionRow | null;
  }

  async expireStaleSessions(now: Date): Promise<void> {
    const { error } = await this.db
      .from("game_sessions")
      .update({ status: "finished", ended_at: now.toISOString() })
      .neq("status", "finished")
      .lt("expires_at", now.toISOString());
    if (error) fail(error, "expireStaleSessions");
  }

  async listPlayers(sessionId: string): Promise<PlayerRow[]> {
    const { data, error } = await this.db
      .from("players")
      .select("*")
      .eq("game_session_id", sessionId)
      .order("joined_at", { ascending: true });
    if (error) fail(error, "listPlayers");
    return (data as PlayerRow[]).map((p) => ({ ...p, total_correct_response_time: Number(p.total_correct_response_time) }));
  }

  async getPlayer(id: string): Promise<PlayerRow | null> {
    const { data, error } = await this.db.from("players").select("*").eq("id", id).maybeSingle();
    if (error) fail(error, "getPlayer");
    return data ? { ...(data as PlayerRow), total_correct_response_time: Number(data.total_correct_response_time) } : null;
  }

  async findPlayerByTokenHash(sessionId: string, tokenHash: string): Promise<PlayerRow | null> {
    const { data, error } = await this.db
      .from("players")
      .select("*")
      .eq("game_session_id", sessionId)
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) fail(error, "findPlayerByTokenHash");
    return data as PlayerRow | null;
  }

  async insertPlayer(row: NewPlayerRow): Promise<PlayerRow> {
    const { data, error } = await this.db.from("players").insert(row).select("*").single();
    if (error) {
      if (error.message.includes("ROOM_FULL")) throw new StoreConflictError("ROOM_FULL");
      if (error.code === UNIQUE_VIOLATION) {
        const text = `${error.message} ${error.details ?? ""}`;
        throw new StoreConflictError(text.includes("token") ? "TOKEN_TAKEN" : "NICKNAME_TAKEN");
      }
      fail(error, "insertPlayer");
    }
    return data as PlayerRow;
  }

  async updatePlayer(
    id: string,
    patch: Partial<Pick<PlayerRow, "connected" | "kicked" | "last_seen_at" | "nickname">>,
  ): Promise<void> {
    const { error } = await this.db.from("players").update(patch).eq("id", id);
    if (error) fail(error, "updatePlayer");
  }

  async applyStandings(sessionId: string, rows: StandingRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.db.rpc("apply_player_standings", { p_session_id: sessionId, p_rows: rows });
    if (error) fail(error, "applyStandings");
  }

  async insertAnswer(row: AnswerRow): Promise<"inserted" | "duplicate"> {
    const { error } = await this.db.from("player_answers").insert(row);
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return "duplicate";
      fail(error, "insertAnswer");
    }
    return "inserted";
  }

  async getAnswer(sessionId: string, playerId: string, questionId: string): Promise<AnswerRow | null> {
    const { data, error } = await this.db
      .from("player_answers")
      .select("*")
      .eq("game_session_id", sessionId)
      .eq("player_id", playerId)
      .eq("question_id", questionId)
      .maybeSingle();
    if (error) fail(error, "getAnswer");
    return data as AnswerRow | null;
  }

  async listAnswers(sessionId: string, questionIds?: string[]): Promise<AnswerRow[]> {
    if (questionIds && questionIds.length === 0) return [];
    // PostgREST caps responses (1000 rows by default), and 50 players × many questions exceeds that.
    const pageSize = 1000;
    const rows: AnswerRow[] = [];
    for (let from = 0; ; from += pageSize) {
      let query = this.db.from("player_answers").select("*").eq("game_session_id", sessionId);
      if (questionIds) query = query.in("question_id", questionIds);
      const { data, error } = await query.order("id").range(from, from + pageSize - 1);
      if (error) fail(error, "listAnswers");
      rows.push(...(data as AnswerRow[]));
      if (!data || data.length < pageSize) return rows;
    }
  }

  async countAnswers(sessionId: string, questionId: string): Promise<number> {
    const { count, error } = await this.db
      .from("player_answers")
      .select("id", { count: "exact", head: true })
      .eq("game_session_id", sessionId)
      .eq("question_id", questionId);
    if (error) fail(error, "countAnswers");
    return count ?? 0;
  }

  async deleteSessionAnswers(sessionId: string): Promise<void> {
    const [answers, progress] = await Promise.all([
      this.db.from("player_answers").delete().eq("game_session_id", sessionId),
      this.db.from("question_progress").delete().eq("game_session_id", sessionId),
    ]);
    if (answers.error) fail(answers.error, "deleteSessionAnswers");
    if (progress.error) fail(progress.error, "deleteSessionAnswers");
  }
}
