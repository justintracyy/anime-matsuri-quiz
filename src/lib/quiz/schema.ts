import { z } from "zod";
import { CHOICE_LABELS, QUESTION_TYPES, QUESTION_TYPE_INFO, type ChoiceLabel, type QuestionType } from "../constants";

export const choiceSchema = z.object({
  id: z.uuid(),
  label: z.enum(CHOICE_LABELS),
  text: z.string().trim().max(120, "Answer choices can be up to 120 characters."),
});

const optionalPath = z.string().trim().max(500).nullable().optional().transform((v) => v || null);
const optionalFileName = z.string().trim().max(255).nullable().optional().transform((v) => v || null);

export const questionSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(1, "Enter the question prompt.").max(500, "Prompts can be up to 500 characters."),
    choices: z.array(choiceSchema).length(4),
    correctLabel: z.enum(CHOICE_LABELS),
    timeLimitSeconds: z.number().int().min(5, "Minimum 5 seconds.").max(240, "Maximum 240 seconds."),
    multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    basePoints: z.number().int().min(0).max(5000).default(500),
    explanation: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
    mediaPath: optionalPath,
    originalMediaPath: optionalPath,
    audioPath: optionalPath,
    audioStartSeconds: z.number().min(0).max(3600).default(0),
    audioDurationSeconds: z.number().positive().max(600).nullable().optional().transform((v) => v ?? null),
    allowAudioReplay: z.boolean().default(true),
    imageFileName: optionalFileName,
    audioFileName: optionalFileName,
  })
  .superRefine((q, ctx) => {
    const filled = q.choices.filter((c) => c.text.length > 0);
    if (filled.length < 2) {
      ctx.addIssue({ code: "custom", path: ["choices"], message: "Provide at least answer choices A and B." });
    }
    q.choices.forEach((c, i) => {
      if (c.label !== CHOICE_LABELS[i]) {
        ctx.addIssue({ code: "custom", path: ["choices", i, "label"], message: "Choices must be ordered A–D." });
      }
    });
    for (const label of ["A", "B"] as const) {
      if (!q.choices.find((c) => c.label === label)?.text) {
        ctx.addIssue({ code: "custom", path: ["choices"], message: `Choice ${label} is required.` });
      }
    }
    const correct = q.choices.find((c) => c.label === q.correctLabel);
    if (!correct?.text) {
      ctx.addIssue({
        code: "custom",
        path: ["correctLabel"],
        message: `The correct answer (${q.correctLabel}) must be one of the filled-in choices.`,
      });
    }
  });

export const roundSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, "Enter a round title.").max(120),
  multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  questions: z.array(questionSchema).max(200),
});

export const quizMetaSchema = z.object({
  title: z.string().trim().min(1, "Enter a quiz title.").max(200),
  subtitle: z.string().trim().max(200).nullable().optional().transform((v) => v || null),
  description: z.string().trim().max(2000).nullable().optional().transform((v) => v || null),
});

export const quizContentSchema = quizMetaSchema.extend({
  rounds: z.array(roundSchema).max(50),
});

export type DraftChoice = z.input<typeof choiceSchema>;
export type DraftQuestion = z.input<typeof questionSchema>;
export type DraftRound = z.input<typeof roundSchema>;
export type QuizContent = z.input<typeof quizContentSchema>;
export type ValidQuizContent = z.output<typeof quizContentSchema>;

export type QuizStatus = "draft" | "published" | "archived";

export interface QuizListItem {
  id: string;
  title: string;
  subtitle: string | null;
  status: QuizStatus;
  updated_at: string;
  question_count: number;
  live_session: { id: string; game_pin: string; status: string } | null;
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function createBlankChoices(texts: string[] = []): DraftChoice[] {
  return CHOICE_LABELS.map((label, i) => ({ id: newId(), label, text: texts[i] ?? "" }));
}

export function createBlankQuestion(type: QuestionType = "TRIVIA", multiplier: 1 | 2 | 3 = 1): DraftQuestion {
  return {
    id: newId(),
    type,
    prompt: "",
    choices: createBlankChoices(),
    correctLabel: "A",
    timeLimitSeconds: QUESTION_TYPE_INFO[type].needsAudio ? 25 : 20,
    multiplier,
    basePoints: 500,
    explanation: null,
    mediaPath: null,
    originalMediaPath: null,
    audioPath: null,
    audioStartSeconds: 0,
    audioDurationSeconds: QUESTION_TYPE_INFO[type].needsAudio ? 15 : null,
    allowAudioReplay: true,
    imageFileName: null,
    audioFileName: null,
  };
}

export function createBlankRound(position: number): DraftRound {
  return { id: newId(), title: `Round ${position + 1}`, multiplier: 1, questions: [] };
}

/** Deep copy with fresh IDs (for the editor's Duplicate button). */
export function duplicateQuestion(q: DraftQuestion): DraftQuestion {
  return {
    ...structuredClone(q),
    id: newId(),
    prompt: q.prompt,
    choices: q.choices.map((c) => ({ ...c, id: newId() })),
  };
}

export interface ReadinessIssue {
  questionId: string;
  severity: "error" | "warning";
  message: string;
}

/** Checks run before publishing / hosting. Errors block publishing, warnings don't. */
export function checkQuizReadiness(content: QuizContent): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const questions = content.rounds.flatMap((r) => r.questions);
  if (questions.length === 0) {
    issues.push({ questionId: "", severity: "error", message: "Add at least one question." });
  }
  questions.forEach((q, i) => {
    const n = `Question ${i + 1}`;
    const parsed = questionSchema.safeParse(q);
    if (!parsed.success) {
      issues.push({ questionId: q.id, severity: "error", message: `${n}: ${parsed.error.issues[0]?.message}` });
    }
    const info = QUESTION_TYPE_INFO[q.type as QuestionType];
    if (info.needsImage && !q.mediaPath) {
      issues.push({ questionId: q.id, severity: "warning", message: `${n}: image is missing${q.imageFileName ? ` (${q.imageFileName})` : ""}.` });
    }
    if (info.needsAudio && !q.audioPath) {
      issues.push({ questionId: q.id, severity: "warning", message: `${n}: audio is missing${q.audioFileName ? ` (${q.audioFileName})` : ""}.` });
    }
  });
  return issues;
}

/** Shape expected by the save_quiz_content SQL function. */
export function toDbContent(content: ValidQuizContent) {
  return {
    title: content.title,
    subtitle: content.subtitle,
    description: content.description,
    rounds: content.rounds.map((r) => ({
      id: r.id,
      title: r.title,
      multiplier: r.multiplier,
      questions: r.questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        correct_label: q.correctLabel,
        time_limit_seconds: q.timeLimitSeconds,
        base_points: q.basePoints,
        multiplier: q.multiplier,
        explanation: q.explanation,
        media_path: q.mediaPath,
        original_media_path: q.originalMediaPath,
        audio_path: q.audioPath,
        audio_start_seconds: q.audioStartSeconds,
        audio_duration_seconds: q.audioDurationSeconds,
        allow_audio_replay: q.allowAudioReplay,
        image_file_name: q.imageFileName,
        audio_file_name: q.audioFileName,
        // Empty optional choices (C/D) are not stored.
        choices: q.choices.filter((c) => c.text.length > 0).map((c) => ({ id: c.id, label: c.label, text: c.text })),
      })),
    })),
  };
}

export interface DbQuestionRow {
  id: string;
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
  image_file_name: string | null;
  audio_file_name: string | null;
  choices: { id: string; label: ChoiceLabel; text: string; position: number }[];
}

export interface DbRoundRow {
  id: string;
  title: string;
  position: number;
  multiplier: number;
  questions: DbQuestionRow[];
}

export function fromDbContent(
  quiz: { title: string; subtitle: string | null; description: string | null },
  rounds: DbRoundRow[],
): QuizContent {
  return {
    title: quiz.title,
    subtitle: quiz.subtitle,
    description: quiz.description,
    rounds: [...rounds]
      .sort((a, b) => a.position - b.position)
      .map((r) => ({
        id: r.id,
        title: r.title,
        multiplier: (r.multiplier as 1 | 2 | 3) ?? 1,
        questions: [...r.questions]
          .sort((a, b) => a.position - b.position)
          .map((q) => {
            const byLabel = new Map(q.choices.map((c) => [c.label, c]));
            const correct = q.choices.find((c) => c.id === q.correct_choice_id);
            return {
              id: q.id,
              type: q.type,
              prompt: q.prompt,
              choices: CHOICE_LABELS.map((label) => ({
                id: byLabel.get(label)?.id ?? newId(),
                label,
                text: byLabel.get(label)?.text ?? "",
              })),
              correctLabel: correct?.label ?? "A",
              timeLimitSeconds: q.time_limit_seconds,
              multiplier: (q.multiplier as 1 | 2 | 3) ?? 1,
              basePoints: q.base_points,
              explanation: q.explanation,
              mediaPath: q.media_path,
              originalMediaPath: q.original_media_path,
              audioPath: q.audio_path,
              audioStartSeconds: Number(q.audio_start_seconds) || 0,
              audioDurationSeconds: q.audio_duration_seconds === null ? null : Number(q.audio_duration_seconds),
              allowAudioReplay: q.allow_audio_replay,
              imageFileName: q.image_file_name,
              audioFileName: q.audio_file_name,
            };
          }),
      })),
  };
}
