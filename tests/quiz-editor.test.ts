import { describe, expect, it } from "vitest";
import {
  checkQuizReadiness,
  createBlankQuestion,
  createBlankRound,
  duplicateQuestion,
  fromDbContent,
  questionSchema,
  quizContentSchema,
  toDbContent,
  type DbRoundRow,
  type DraftQuestion,
  type QuizContent,
} from "@/lib/quiz/schema";

function filledQuestion(overrides: Partial<DraftQuestion> = {}): DraftQuestion {
  const q = createBlankQuestion("TRIVIA");
  q.prompt = "Which festival food is shaped like a fish?";
  q.choices[0].text = "Taiyaki";
  q.choices[1].text = "Takoyaki";
  q.choices[2].text = "Dango";
  q.correctLabel = "A";
  return { ...q, ...overrides };
}

function quiz(questions: DraftQuestion[]): QuizContent {
  const round = createBlankRound(0);
  round.questions = questions;
  return { title: "Sakura & Spirits", subtitle: "Season 2", description: null, rounds: [round] };
}

describe("quiz creation", () => {
  it("validates a complete quiz", () => {
    const parsed = quizContentSchema.safeParse(quiz([filledQuestion()]));
    expect(parsed.success).toBe(true);
  });

  it("requires a title", () => {
    const parsed = quizContentSchema.safeParse({ ...quiz([]), title: "  " });
    expect(parsed.success).toBe(false);
  });

  it("blocks publishing when there are no questions or a question is invalid", () => {
    expect(checkQuizReadiness(quiz([]))).toContainEqual(expect.objectContaining({ severity: "error" }));
    const broken = filledQuestion({ prompt: "" });
    expect(checkQuizReadiness(quiz([broken])).filter((i) => i.severity === "error")).toHaveLength(1);
  });

  it("warns (but allows publishing) when media still needs to be attached", () => {
    const q = filledQuestion({ type: "SILHOUETTE", imageFileName: "fox.png" });
    const issues = checkQuizReadiness(quiz([q]));
    expect(issues).toEqual([expect.objectContaining({ severity: "warning", message: expect.stringContaining("fox.png") })]);
  });
});

describe("manual question creation", () => {
  it("starts with four blank A–D choices and type-appropriate defaults", () => {
    const q = createBlankQuestion("OPENING_AUDIO", 2);
    expect(q.choices.map((c) => c.label)).toEqual(["A", "B", "C", "D"]);
    expect(q).toMatchObject({ timeLimitSeconds: 25, multiplier: 2, audioDurationSeconds: 15 });
    expect(questionSchema.safeParse(q).success).toBe(false);
  });

  it("requires A and B and a correct answer that points to a filled choice", () => {
    const missingB = filledQuestion();
    missingB.choices[1].text = "";
    expect(questionSchema.safeParse(missingB).success).toBe(false);
    expect(questionSchema.safeParse(filledQuestion({ correctLabel: "D" })).success).toBe(false);
    expect(questionSchema.safeParse(filledQuestion({ correctLabel: "C" })).success).toBe(true);
  });

  it("enforces time limit and multiplier bounds", () => {
    expect(questionSchema.safeParse(filledQuestion({ timeLimitSeconds: 4 })).success).toBe(false);
    expect(questionSchema.safeParse(filledQuestion({ timeLimitSeconds: 241 })).success).toBe(false);
    expect(questionSchema.safeParse(filledQuestion({ multiplier: 4 as 1 })).success).toBe(false);
  });

  it("duplicates with fresh ids", () => {
    const q = filledQuestion();
    const copy = duplicateQuestion(q);
    expect(copy.id).not.toBe(q.id);
    expect(copy.choices.map((c) => c.id)).not.toEqual(q.choices.map((c) => c.id));
    expect(copy.choices.map((c) => c.text)).toEqual(q.choices.map((c) => c.text));
  });

  it("round-trips through the database shape, dropping empty optional choices", () => {
    const content = quizContentSchema.parse(quiz([filledQuestion({ correctLabel: "B" })]));
    const db = toDbContent(content);
    const dbQuestion = db.rounds[0].questions[0];
    expect(dbQuestion.choices.map((c) => c.label)).toEqual(["A", "B", "C"]);
    expect(dbQuestion.correct_label).toBe("B");

    const rows: DbRoundRow[] = db.rounds.map((r, ri) => ({
      id: r.id,
      title: r.title,
      position: ri,
      multiplier: r.multiplier,
      questions: r.questions.map((q, qi) => ({
        ...q,
        position: qi,
        correct_choice_id: q.choices.find((c) => c.label === q.correct_label)!.id,
        choices: q.choices.map((c, i) => ({ ...c, position: i })),
      })),
    }));
    const back = fromDbContent({ title: db.title, subtitle: db.subtitle, description: db.description }, rows);
    const q = back.rounds[0].questions[0];
    expect(q.correctLabel).toBe("B");
    expect(q.choices).toHaveLength(4);
    expect(q.choices[3].text).toBe("");
    expect(q.id).toBe(content.rounds[0].questions[0].id);
  });
});
