import "server-only";
import { GameError } from "../game/errors";
import { signPaths } from "../storage";
import { getSupabaseAdmin } from "../supabase/admin";
import {
  checkQuizReadiness,
  fromDbContent,
  quizContentSchema,
  quizMetaSchema,
  toDbContent,
  type DbRoundRow,
  type QuizContent,
  type QuizListItem,
  type QuizStatus,
} from "./schema";

export interface QuizDetail {
  id: string;
  status: QuizStatus;
  updatedAt: string;
  content: QuizContent;
  mediaUrls: Record<string, string>;
}

export async function listQuizzes(): Promise<QuizListItem[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("quizzes")
    .select("id, title, subtitle, status, updated_at, rounds(questions(count))")
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listQuizzes: ${error.message}`);

  const { data: sessions, error: sessionError } = await db
    .from("game_sessions")
    .select("id, quiz_id, game_pin, status, created_at")
    .neq("status", "finished")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (sessionError) throw new Error(`listQuizzes sessions: ${sessionError.message}`);

  type Row = { id: string; title: string; subtitle: string | null; status: QuizStatus; updated_at: string; rounds: { questions: { count: number }[] }[] };
  return (data as Row[]).map((q) => {
    const live = sessions?.find((s) => s.quiz_id === q.id);
    return {
      id: q.id,
      title: q.title,
      subtitle: q.subtitle,
      status: q.status,
      updated_at: q.updated_at,
      question_count: q.rounds.reduce((sum, r) => sum + (r.questions[0]?.count ?? 0), 0),
      live_session: live ? { id: live.id, game_pin: live.game_pin, status: live.status } : null,
    };
  });
}

export async function createQuiz(input: unknown): Promise<{ id: string }> {
  const meta = quizMetaSchema.parse(input);
  const { data, error } = await getSupabaseAdmin()
    .from("quizzes")
    .insert({ title: meta.title, subtitle: meta.subtitle, description: meta.description, status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(`createQuiz: ${error.message}`);
  return data;
}

export async function getQuizDetail(id: string): Promise<QuizDetail> {
  const db = getSupabaseAdmin();
  const { data: quiz, error } = await db
    .from("quizzes")
    .select("id, title, subtitle, description, status, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getQuizDetail: ${error.message}`);
  if (!quiz) throw new GameError("NOT_FOUND", "Quiz not found.");

  const { data: rounds, error: roundsError } = await db
    .from("rounds")
    .select("id, title, position, multiplier, questions(*, choices!choices_question_id_fkey(id, label, text, position))")
    .eq("quiz_id", id);
  if (roundsError) throw new Error(`getQuizDetail rounds: ${roundsError.message}`);

  const content = fromDbContent(quiz, rounds as DbRoundRow[]);
  const paths = content.rounds.flatMap((r) => r.questions.flatMap((q) => [q.mediaPath, q.originalMediaPath, q.audioPath]));
  return { id: quiz.id, status: quiz.status, updatedAt: quiz.updated_at, content, mediaUrls: await signPaths(paths) };
}

export async function saveQuizContent(id: string, input: unknown): Promise<void> {
  const content = quizContentSchema.parse(input);
  const { error } = await getSupabaseAdmin().rpc("save_quiz_content", { p_quiz_id: id, p_content: toDbContent(content) });
  if (error) {
    if (error.message.includes("QUIZ_NOT_FOUND")) throw new GameError("NOT_FOUND", "Quiz not found.");
    if (error.message.includes("_ID_CONFLICT")) throw new GameError("VALIDATION", "Some items belong to another quiz. Reload and try again.");
    throw new Error(`saveQuizContent: ${error.message}`);
  }
}

export async function setQuizStatus(id: string, status: QuizStatus): Promise<{ warnings: string[] }> {
  let warnings: string[] = [];
  if (status === "published") {
    const detail = await getQuizDetail(id);
    const issues = checkQuizReadiness(detail.content);
    const errors = issues.filter((i) => i.severity === "error");
    if (errors.length) {
      throw new GameError("VALIDATION", `Fix these before publishing: ${errors.map((e) => e.message).join(" ")}`);
    }
    warnings = issues.filter((i) => i.severity === "warning").map((i) => i.message);
  }
  const { error } = await getSupabaseAdmin().from("quizzes").update({ status }).eq("id", id);
  if (error) throw new Error(`setQuizStatus: ${error.message}`);
  return { warnings };
}

export async function deleteQuiz(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("quizzes").delete().eq("id", id);
  if (error) throw new Error(`deleteQuiz: ${error.message}`);
}

export async function updateQuestionImage(
  questionId: string,
  media: { mediaPath: string; originalMediaPath: string | null },
): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from("questions")
    .update({ media_path: media.mediaPath, original_media_path: media.originalMediaPath })
    .eq("id", questionId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`updateQuestionImage: ${error.message}`);
  if (!data) throw new GameError("NOT_FOUND", "Question not found.");
}

export async function listQuestionsForPicker(quizId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("rounds")
    .select("title, position, questions(id, type, prompt, position, media_path)")
    .eq("quiz_id", quizId)
    .order("position");
  if (error) throw new Error(`listQuestionsForPicker: ${error.message}`);
  type Row = { title: string; position: number; questions: { id: string; type: string; prompt: string; position: number; media_path: string | null }[] };
  return (data as Row[]).flatMap((r) =>
    [...r.questions]
      .sort((a, b) => a.position - b.position)
      .map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, roundTitle: r.title, hasImage: !!q.media_path })),
  );
}
