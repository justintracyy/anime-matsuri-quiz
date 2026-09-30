import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { indexMediaFiles, matchMedia, parseQuestionWorkbook, parseTimestamp, readWorkbook, validateRows } from "@/lib/excel/import";
import { TEMPLATE_COLUMNS, TEMPLATE_SAMPLE_ROWS, buildTemplateWorkbook } from "@/lib/excel/template";
import { questionSchema } from "@/lib/quiz/schema";

type Row = (string | number)[];
const header = [...TEMPLATE_COLUMNS];

function row(overrides: Partial<Record<(typeof TEMPLATE_COLUMNS)[number], string | number>> = {}): Row {
  const base: Record<string, string | number> = {
    Round: "Round 1",
    "Question Type": "TRIVIA",
    Question: "Which studio made Spirited Away?",
    "Choice A": "Studio Ghibli",
    "Choice B": "MAPPA",
    "Choice C": "",
    "Choice D": "",
    "Correct Answer": "A",
    "Time Limit": 20,
    "Point Multiplier": 1,
    "Image File Name": "",
    "Audio File Name": "",
    "Audio Start": "",
    "Audio Duration": "",
    Explanation: "",
    ...overrides,
  };
  return TEMPLATE_COLUMNS.map((c) => base[c]);
}

function roundTrip(wb: XLSX.WorkBook) {
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return parseQuestionWorkbook(XLSX, readWorkbook(XLSX, buffer));
}

describe("Excel template", () => {
  it("has every required column and sample rows that import cleanly", () => {
    const wb = buildTemplateWorkbook(XLSX);
    expect(wb.SheetNames).toEqual(["Questions", "Instructions"]);
    const result = roundTrip(wb);
    expect(result.workbookErrors).toEqual([]);
    expect(result.rows).toHaveLength(TEMPLATE_SAMPLE_ROWS.length);
    for (const r of result.rows) {
      expect(r.errors).toEqual([]);
      expect(questionSchema.safeParse(r.question).success).toBe(true);
    }
    const audio = result.rows.find((r) => r.question.type === "VOICE_AUDIO")!;
    expect(audio.question).toMatchObject({ audioFileName: "kamehameha.ogg", audioStartSeconds: 2.5, audioDurationSeconds: 8 });
    expect(result.rows.find((r) => r.question.type === "TRIVIA")!.question.multiplier).toBe(3);
  });

  it("imports the legacy .xls format too", () => {
    const wb = buildTemplateWorkbook(XLSX);
    const buffer = XLSX.write(wb, { type: "array", bookType: "biff8" }) as ArrayBuffer;
    const result = parseQuestionWorkbook(XLSX, readWorkbook(XLSX, buffer));
    expect(result.rows.filter((r) => r.valid)).toHaveLength(TEMPLATE_SAMPLE_ROWS.length);
  });
});

describe("row validation", () => {
  it("reports the row number, column, value and a fix for each problem", () => {
    const result = validateRows([
      header,
      row(),
      row({ "Question Type": "GUESS", "Correct Answer": "E" }),
      row({ Question: "", "Time Limit": 2, "Point Multiplier": 5 }),
      row({ "Correct Answer": "C" }),
    ]);
    expect(result.rows.map((r) => r.valid)).toEqual([true, false, false, false]);

    const r3 = result.rows[1].errors;
    expect(r3).toContainEqual(expect.objectContaining({ rowNumber: 3, column: "Question Type", value: "GUESS" }));
    expect(r3).toContainEqual(expect.objectContaining({ rowNumber: 3, column: "Correct Answer", value: "E", message: "Enter A, B, C or D." }));

    const r4 = result.rows[2].errors.map((e) => e.column);
    expect(r4).toEqual(expect.arrayContaining(["Question", "Time Limit", "Point Multiplier"]));

    expect(result.rows[3].errors[0]).toMatchObject({ rowNumber: 5, column: "Correct Answer", message: expect.stringContaining("Choice C is empty") });
  });

  it("requires media file names for image and audio question types", () => {
    const result = validateRows([
      header,
      row({ "Question Type": "SILHOUETTE" }),
      row({ "Question Type": "opening audio", "Audio File Name": "op.mp4" }),
      row({ "Question Type": "Blurred-Image", "Image File Name": "scene.webp" }),
    ]);
    expect(result.rows[0].errors[0]).toMatchObject({ column: "Image File Name" });
    expect(result.rows[1].question.type).toBe("OPENING_AUDIO");
    expect(result.rows[1].errors[0]).toMatchObject({ column: "Audio File Name", value: "op.mp4" });
    expect(result.rows[2]).toMatchObject({ valid: true, question: { type: "BLURRED_IMAGE", imageFileName: "scene.webp" } });
  });

  it("accepts friendly formats for numbers and letters", () => {
    const [r] = validateRows([
      header,
      row({ Round: 2, "Correct Answer": "choice b", "Time Limit": "30s", "Point Multiplier": "2x", "Audio Start": "1:05" }),
    ]).rows;
    expect(r).toMatchObject({ valid: true, roundTitle: "Round 2" });
    expect(r.question).toMatchObject({ correctLabel: "B", timeLimitSeconds: 30, multiplier: 2, audioStartSeconds: 65 });
  });

  it("skips blank rows and flags missing headers", () => {
    expect(validateRows([header, row(), [], ["", ""], row()]).rows.map((r) => r.rowNumber)).toEqual([2, 5]);
    const missing = validateRows([["Question", "Choice A"], ["x", "y"]]);
    expect(missing.rows).toEqual([]);
    expect(missing.workbookErrors.map((e) => e.column)).toEqual(["Question Type", "Choice B", "Correct Answer"]);
    expect(validateRows([header]).workbookErrors[0].message).toMatch(/No question rows/);
  });

  it("parses timestamps", () => {
    expect(parseTimestamp("12.5")).toBe(12.5);
    expect(parseTimestamp("2:03")).toBe(123);
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("abc")).toBeNaN();
  });
});

describe("media matching", () => {
  it("matches referenced files by name, case-insensitively, and flags missing ones", () => {
    const { rows } = validateRows([
      header,
      row({ "Question Type": "SILHOUETTE", "Image File Name": "Naruto.PNG" }),
      row({ "Question Type": "OPENING_AUDIO", "Audio File Name": "gurenge.mp3" }),
      row(),
    ]);
    const files = indexMediaFiles([{ name: "naruto.png" }, { name: "other.jpg" }]);
    expect(matchMedia(rows[0], files)).toMatchObject({ image: "matched", imageFile: { name: "naruto.png" } });
    expect(matchMedia(rows[1], files)).toMatchObject({ audio: "missing", image: "not_referenced" });
    expect(matchMedia(rows[2], files)).toMatchObject({ image: "not_referenced", audio: "not_referenced" });
  });
});
