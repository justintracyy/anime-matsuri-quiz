import type { ChoiceLabel, QuestionType } from "../constants";

export type SessionStatus = "lobby" | "in_progress" | "finished";
export type GamePhase = "lobby" | "ready" | "active" | "paused" | "closed" | "results" | "leaderboard" | "final";

/** Row shape of public.game_sessions. Timestamps are ISO strings. */
export interface SessionRow {
  id: string;
  quiz_id: string;
  game_pin: string;
  status: SessionStatus;
  phase: GamePhase;
  current_round_index: number;
  current_question_index: number;
  question_started_at: string | null;
  question_ends_at: string | null;
  paused_remaining_ms: number | null;
  show_results: boolean;
  question_order: string[];
  revealed_question_ids: string[];
  skipped_question_ids: string[];
  allow_late_join: boolean;
  mirror_to_players: boolean;
  max_players: number;
  state_version: number;
  created_at: string;
  ended_at: string | null;
  expires_at: string;
}

export type NewSessionRow = Pick<SessionRow, "quiz_id" | "game_pin" | "question_order" | "expires_at"> &
  Partial<Pick<SessionRow, "allow_late_join" | "mirror_to_players" | "max_players">>;

export type SessionPatch = Partial<Omit<SessionRow, "id" | "quiz_id" | "created_at" | "state_version">>;

export interface PlayerRow {
  id: string;
  game_session_id: string;
  nickname: string;
  token_hash: string;
  score: number;
  streak: number;
  best_streak: number;
  correct_answer_count: number;
  total_correct_response_time: number;
  last_points: number;
  connected: boolean;
  kicked: boolean;
  joined_at: string;
  last_seen_at: string;
}

export type PublicPlayerRow = Omit<PlayerRow, "token_hash">;

export interface NewPlayerRow {
  id: string;
  game_session_id: string;
  nickname: string;
  token_hash: string;
  joined_at: string;
  last_seen_at: string;
}

export interface AnswerRow {
  id: string;
  game_session_id: string;
  player_id: string;
  question_id: string;
  selected_choice_id: string | null;
  is_correct: boolean;
  submitted_at: string;
  response_time_ms: number;
  points_awarded: number;
}

export interface ChoiceRecord {
  id: string;
  label: ChoiceLabel;
  text: string;
  position: number;
}

export interface QuestionRecord {
  id: string;
  round_id: string;
  round_title: string;
  round_position: number;
  type: QuestionType;
  prompt: string;
  correct_choice_id: string | null;
  time_limit_seconds: number;
  base_points: number;
  multiplier: number;
  explanation: string | null;
  media_path: string | null;
  original_media_path: string | null;
  audio_path: string | null;
  audio_start_seconds: number;
  audio_duration_seconds: number | null;
  allow_audio_replay: boolean;
  choices: ChoiceRecord[];
}

export interface QuizSummary {
  id: string;
  title: string;
  subtitle: string | null;
  status: "draft" | "published" | "archived";
}

export interface StandingRow {
  id: string;
  score: number;
  streak: number;
  best_streak: number;
  correct_answer_count: number;
  total_correct_response_time: number;
  last_points: number;
}

export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  rank: number;
  score: number;
  streak: number;
  correctCount: number;
  totalCorrectResponseTimeMs: number;
  lastPoints: number;
}

// ───────────────────────── Views returned by the API ─────────────────────────

export interface SessionView {
  id: string;
  pin: string;
  status: SessionStatus;
  phase: GamePhase;
  stateVersion: number;
  questionIndex: number;
  roundIndex: number;
  totalQuestions: number;
  questionStartedAt: string | null;
  questionEndsAt: string | null;
  pausedRemainingMs: number | null;
  allowLateJoin: boolean;
  mirrorToPlayers: boolean;
  maxPlayers: number;
  expiresAt: string;
}

export interface MediaRef {
  /** Storage path; converted to a signed URL by the route handler. */
  path: string | null;
  url?: string | null;
}

export interface QuestionView {
  id: string;
  index: number;
  type: QuestionType;
  prompt: string;
  roundTitle: string;
  roundIndex: number;
  isNewRound: boolean;
  timeLimitSeconds: number;
  multiplier: number;
  choices: { id: string; label: ChoiceLabel; text: string }[];
  image: MediaRef | null;
  audio: (MediaRef & { startSeconds: number; durationSeconds: number | null; allowReplay: boolean }) | null;
  /** Only present once the answer has been revealed. */
  correctChoiceId: string | null;
  explanation: string | null;
}

export interface QuestionResults {
  questionId: string;
  correctChoiceId: string | null;
  distribution: Record<string, number>;
  answeredCount: number;
  correctCount: number;
  fastest: { playerId: string; nickname: string; responseTimeMs: number } | null;
}

export interface HostView {
  serverNow: number;
  session: SessionView;
  quiz: { id: string; title: string; subtitle: string | null };
  players: (PublicPlayerRow & { rank: number | null })[];
  activePlayerCount: number;
  question: QuestionView | null;
  nextQuestion: { index: number; roundTitle: string; type: QuestionType } | null;
  answerCount: number;
  results: QuestionResults | null;
  leaderboard: LeaderboardEntry[];
  podium: LeaderboardEntry[];
}

export interface PlayerResult {
  answered: boolean;
  correct: boolean;
  selectedChoiceId: string | null;
  correctChoiceId: string | null;
  pointsAwarded: number;
  responseTimeMs: number | null;
  wasFastest: boolean;
}

export interface PlayerView {
  serverNow: number;
  session: SessionView;
  quizTitle: string;
  me: {
    id: string;
    nickname: string;
    score: number;
    streak: number;
    bestStreak: number;
    correctCount: number;
    rank: number | null;
    playerCount: number;
    kicked: boolean;
  };
  question: QuestionView | null;
  myAnswer: { choiceId: string | null; responseTimeMs: number } | null;
  result: PlayerResult | null;
  podium: LeaderboardEntry[];
}

export interface JoinInfo {
  sessionId: string;
  pin: string;
  quizTitle: string;
  status: SessionStatus;
  phase: GamePhase;
  playerCount: number;
  maxPlayers: number;
  joinable: boolean;
  reason: "ok" | "full" | "started" | "ended" | "expired";
}
