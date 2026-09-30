import type * as XLSXType from "xlsx";
import {
  AUDIO_EXTENSIONS,
  CHOICE_LABELS,
  IMAGE_EXTENSIONS,
  QUESTION_TYPES,
  QUESTION_TYPE_INFO,
  type ChoiceLabel,
  type QuestionType,
} from "../constants";
import { createBlankChoices, newId, type DraftQuestion } from "../quiz/schema";
import { REQUIRED_COLUMNS, TEMPLATE_COLUMNS, type TemplateColumn } from "./template";

export interface ImportIssue {
  /** 1-based Excel row number (the header is row 1). */
  rowNumber: number;
  column: TemplateColumn | "Workbook";
  value: string;
  message: string;
}

export interface ImportRow {
  rowNumber: number;
  roundTitle: string;
  question: DraftQuestion;
  errors: ImportIssue[];
  valid: boolean;
}

export interface ImportResult {
  rows: ImportRow[];
  workbookErrors: ImportIssue[];
  sheetName: string | null;
}

export type MediaMatchStatus = "not_required" | "matched" | "missing" | "not_referenced";

export interface MediaMatch<F extends { name: string } = File> {
  image: MediaMatchStatus;
  audio: MediaMatchStatus;
  imageFile?: F;
  audioFile?: F;
}

type Cell = string | number | boolean | Date | null | undefined;

const MAX_ROWS = 500;

function cellText(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function normalizeHeader(value: Cell): string {
  return cellText(value).toLowerCase().replace(/[^a-z]/g, "");
}

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match ? match[1].toLowerCase() : "";
}

export function mediaKey(fileName: string): string {
  return fileName.trim().split(/[\\/]/).pop()!.toLowerCase();
}

/** Accepts seconds ("12.5") or minutes:seconds ("1:05.5"). */
export function parseTimestamp(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const mmss = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(text);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

export function readWorkbook(XLSX: typeof XLSXType, data: ArrayBuffer | Uint8Array): XLSXType.WorkBook {
  return XLSX.read(data, { type: "array", cellDates: false, dense: false });
}

export function parseQuestionWorkbook(XLSX: typeof XLSXType, workbook: XLSXType.WorkBook): ImportResult {
  const sheetName =
    workbook.SheetNames.find((n) => n.trim().toLowerCase() === "questions") ?? workbook.SheetNames[0] ?? null;
  if (!sheetName) {
    return {
      rows: [],
      sheetName: null,
      workbookErrors: [{ rowNumber: 0, column: "Workbook", value: "", message: "The workbook has no sheets." }],
    };
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: "", blankrows: true });
  return validateRows(matrix, sheetName);
}

export function validateRows(matrix: Cell[][], sheetName: string | null = "Questions"): ImportResult {
  const workbookErrors: ImportIssue[] = [];
  const header = matrix[0] ?? [];
  const columnIndex = new Map<TemplateColumn, number>();
  header.forEach((h, i) => {
    const key = normalizeHeader(h);
    const column = TEMPLATE_COLUMNS.find((c) => normalizeHeader(c) === key);
    if (column && !columnIndex.has(column)) columnIndex.set(column, i);
  });

  for (const column of REQUIRED_COLUMNS) {
    if (!columnIndex.has(column)) {
      workbookErrors.push({
        rowNumber: 1,
        column,
        value: "",
        message: `Missing required column “${column}”. Download the template and keep its header row.`,
      });
    }
  }
  if (workbookErrors.length) return { rows: [], workbookErrors, sheetName };

  const rows: ImportRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    const get = (c: TemplateColumn) => {
      const idx = columnIndex.get(c);
      return idx === undefined ? "" : cellText(raw[idx]);
    };
    if (TEMPLATE_COLUMNS.every((c) => get(c) === "")) continue;
    if (rows.length >= MAX_ROWS) {
      workbookErrors.push({
        rowNumber: r + 1,
        column: "Workbook",
        value: "",
        message: `Only the first ${MAX_ROWS} questions are imported. Split larger workbooks.`,
      });
      break;
    }
    rows.push(validateRow(r + 1, get));
  }

  if (rows.length === 0 && workbookErrors.length === 0) {
    workbookErrors.push({ rowNumber: 2, column: "Workbook", value: "", message: "No question rows were found below the header." });
  }
  return { rows, workbookErrors, sheetName };
}

function validateRow(rowNumber: number, get: (c: TemplateColumn) => string): ImportRow {
  const errors: ImportIssue[] = [];
  const issue = (column: TemplateColumn, value: string, message: string) =>
    errors.push({ rowNumber, column, value, message });

  // Round
  let roundTitle = get("Round");
  if (!roundTitle) roundTitle = "Round 1";
  else if (/^\d+$/.test(roundTitle)) roundTitle = `Round ${roundTitle}`;
  if (roundTitle.length > 120) issue("Round", roundTitle, "Shorten the round name to 120 characters or fewer.");

  // Question type
  const typeRaw = get("Question Type");
  const typeKey = typeRaw.toUpperCase().replace(/[\s-]+/g, "_");
  let type: QuestionType = "TRIVIA";
  if (!typeRaw) issue("Question Type", typeRaw, `Enter a question type: ${QUESTION_TYPES.join(", ")}.`);
  else if (!(QUESTION_TYPES as readonly string[]).includes(typeKey)) {
    issue("Question Type", typeRaw, `Use one of: ${QUESTION_TYPES.join(", ")}.`);
  } else type = typeKey as QuestionType;

  // Prompt
  const prompt = get("Question");
  if (!prompt) issue("Question", prompt, "Enter the question text.");
  else if (prompt.length > 500) issue("Question", `${prompt.slice(0, 40)}…`, "Shorten the question to 500 characters or fewer.");

  // Choices
  const texts = (["Choice A", "Choice B", "Choice C", "Choice D"] as const).map((c) => get(c));
  (["Choice A", "Choice B"] as const).forEach((c, i) => {
    if (!texts[i]) issue(c, "", `Enter the text for ${c}.`);
  });
  (["Choice A", "Choice B", "Choice C", "Choice D"] as const).forEach((c, i) => {
    if (texts[i].length > 120) issue(c, `${texts[i].slice(0, 40)}…`, "Shorten the answer to 120 characters or fewer.");
  });
  if (!texts[2] && texts[3]) issue("Choice C", "", "Fill in Choice C before Choice D, or move the answer up.");

  // Correct answer
  const correctRaw = get("Correct Answer");
  const correct = correctRaw.toUpperCase().replace(/^CHOICE\s*/, "");
  let correctLabel: ChoiceLabel = "A";
  if (!(CHOICE_LABELS as readonly string[]).includes(correct)) {
    issue("Correct Answer", correctRaw, "Enter A, B, C or D.");
  } else {
    correctLabel = correct as ChoiceLabel;
    const idx = CHOICE_LABELS.indexOf(correctLabel);
    if (!texts[idx]) issue("Correct Answer", correctRaw, `Choice ${correctLabel} is empty. Fill it in or pick another letter.`);
  }

  // Time limit
  const timeRaw = get("Time Limit");
  let timeLimitSeconds = QUESTION_TYPE_INFO[type].needsAudio ? 25 : 20;
  if (timeRaw) {
    const n = Number(timeRaw.replace(/s(ec(onds?)?)?$/i, "").trim());
    if (!Number.isInteger(n) || n < 5 || n > 240) issue("Time Limit", timeRaw, "Enter a whole number of seconds between 5 and 240.");
    else timeLimitSeconds = n;
  }

  // Multiplier
  const multRaw = get("Point Multiplier");
  let multiplier: 1 | 2 | 3 = 1;
  if (multRaw) {
    const n = Number(multRaw.replace(/x$/i, "").trim());
    if (n !== 1 && n !== 2 && n !== 3) issue("Point Multiplier", multRaw, "Enter 1, 2 or 3.");
    else multiplier = n;
  }

  // Media references
  const info = QUESTION_TYPE_INFO[type];
  const imageFileName = get("Image File Name");
  if (imageFileName) {
    if (!(IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(imageFileName))) {
      issue("Image File Name", imageFileName, "Use a .png, .jpg, .jpeg or .webp file name.");
    }
  } else if (info.needsImage) {
    issue("Image File Name", "", `${type} questions need an image file name (e.g. character.png).`);
  }

  const audioFileName = get("Audio File Name");
  if (audioFileName) {
    if (!(AUDIO_EXTENSIONS as readonly string[]).includes(extensionOf(audioFileName))) {
      issue("Audio File Name", audioFileName, "Use a .mp3, .wav or .ogg file name.");
    }
  } else if (info.needsAudio) {
    issue("Audio File Name", "", `${type} questions need an audio file name (e.g. opening.mp3).`);
  }

  const startRaw = get("Audio Start");
  let audioStartSeconds = 0;
  if (startRaw) {
    const n = parseTimestamp(startRaw);
    if (n === null || Number.isNaN(n) || n < 0 || n > 3600) {
      issue("Audio Start", startRaw, "Enter seconds (e.g. 12.5) or mm:ss (e.g. 1:05), 0 or more.");
    } else audioStartSeconds = n;
  }

  const durationRaw = get("Audio Duration");
  let audioDurationSeconds: number | null = null;
  if (durationRaw) {
    const n = parseTimestamp(durationRaw);
    if (n === null || Number.isNaN(n) || n <= 0 || n > 600) {
      issue("Audio Duration", durationRaw, "Enter a clip length in seconds greater than 0 and up to 600.");
    } else audioDurationSeconds = n;
  }

  const explanation = get("Explanation");
  if (explanation.length > 1000) issue("Explanation", `${explanation.slice(0, 40)}…`, "Shorten the explanation to 1000 characters or fewer.");

  const question: DraftQuestion = {
    id: newId(),
    type,
    prompt,
    choices: createBlankChoices(texts),
    correctLabel,
    timeLimitSeconds,
    multiplier,
    basePoints: 500,
    explanation: explanation || null,
    mediaPath: null,
    originalMediaPath: null,
    audioPath: null,
    audioStartSeconds,
    audioDurationSeconds,
    allowAudioReplay: true,
    imageFileName: imageFileName || null,
    audioFileName: audioFileName || null,
  };

  return { rowNumber, roundTitle, question, errors, valid: errors.length === 0 };
}

/** Match file names referenced in the workbook to files the organizer selected. */
export function matchMedia<F extends { name: string }>(row: Pick<ImportRow, "question">, files: Map<string, F>): MediaMatch<F> {
  const q = row.question;
  const info = QUESTION_TYPE_INFO[q.type as QuestionType];
  const imageFile = q.imageFileName ? files.get(mediaKey(q.imageFileName)) : undefined;
  const audioFile = q.audioFileName ? files.get(mediaKey(q.audioFileName)) : undefined;
  return {
    image: q.imageFileName ? (imageFile ? "matched" : "missing") : info.needsImage ? "missing" : "not_referenced",
    audio: q.audioFileName ? (audioFile ? "matched" : "missing") : info.needsAudio ? "missing" : "not_referenced",
    imageFile,
    audioFile,
  };
}

export function indexMediaFiles<F extends { name: string }>(files: Iterable<F>): Map<string, F> {
  const map = new Map<string, F>();
  for (const f of files) map.set(mediaKey(f.name), f);
  return map;
}
