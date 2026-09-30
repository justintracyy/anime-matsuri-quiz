import type * as XLSXType from "xlsx";
import { QUESTION_TYPES } from "../constants";

export const TEMPLATE_COLUMNS = [
  "Round",
  "Question Type",
  "Question",
  "Choice A",
  "Choice B",
  "Choice C",
  "Choice D",
  "Correct Answer",
  "Time Limit",
  "Point Multiplier",
  "Image File Name",
  "Audio File Name",
  "Audio Start",
  "Audio Duration",
  "Explanation",
] as const;
export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

export const REQUIRED_COLUMNS: TemplateColumn[] = [
  "Question Type",
  "Question",
  "Choice A",
  "Choice B",
  "Correct Answer",
];

export const TEMPLATE_SAMPLE_ROWS: (string | number)[][] = [
  ["Round 1", "SILHOUETTE", "Who is this character?", "Naruto Uzumaki", "Sasuke Uchiha", "Kakashi Hatake", "Rock Lee", "A", 20, 1, "naruto.png", "", "", "", "The silhouette of the Seventh Hokage."],
  ["Round 1", "OPENING_AUDIO", "Which anime is this opening from?", "Attack on Titan", "Demon Slayer", "Jujutsu Kaisen", "Chainsaw Man", "B", 25, 1, "", "gurenge.mp3", 0, 15, "Gurenge by LiSA."],
  ["Round 1", "VOICE_AUDIO", "Who says this line?", "Goku", "Vegeta", "Gohan", "Piccolo", "A", 20, 1, "", "kamehameha.ogg", 2.5, 8, ""],
  ["Round 1", "BLURRED_IMAGE", "Which anime is this key visual from?", "Your Name", "Weathering With You", "Suzume", "A Silent Voice", "A", 20, 1, "your-name.jpg", "", "", "", ""],
  ["Round 2", "EMOJI", "🍥🦊🍜🥷", "Bleach", "Naruto", "One Piece", "Fairy Tail", "B", 20, 2, "", "", "", "", "Narutomaki, a fox, ramen and ninjas."],
  ["Round 2", "QUOTE", "\"I'm gonna be King of the Pirates!\"", "Zoro", "Ace", "Luffy", "Shanks", "C", 20, 2, "", "", "", "", ""],
  ["Round 2", "SCENE", "Which anime is this scene from?", "Spirited Away", "Howl's Moving Castle", "Princess Mononoke", "Ponyo", "A", 20, 2, "bathhouse.webp", "", "", "", ""],
  ["Round 3", "TRIVIA", "Which studio animated \"Spirited Away\"?", "Studio Ghibli", "Kyoto Animation", "MAPPA", "Madhouse", "A", 20, 3, "", "", "", "", "Released in 2001."],
];

export const TEMPLATE_INSTRUCTIONS: string[][] = [
  ["Column", "Required", "Accepted values"],
  ["Round", "No", "Round name or number. Rows with the same value are grouped. Defaults to “Round 1”."],
  ["Question Type", "Yes", QUESTION_TYPES.join(", ")],
  ["Question", "Yes", "Prompt shown on the host screen (up to 500 characters). For EMOJI, put the emojis here."],
  ["Choice A – Choice D", "A and B", "Answer text, up to 120 characters. C and D are optional."],
  ["Correct Answer", "Yes", "A, B, C or D — must point to a filled-in choice."],
  ["Time Limit", "No", "Whole seconds from 5 to 240. Defaults to 20."],
  ["Point Multiplier", "No", "1 (regular), 2 (double) or 3 (triple). Defaults to 1."],
  ["Image File Name", "SILHOUETTE, BLURRED_IMAGE, SCENE", "e.g. naruto.png — .png, .jpg, .jpeg or .webp. Upload the files alongside the workbook."],
  ["Audio File Name", "OPENING_AUDIO, VOICE_AUDIO", "e.g. gurenge.mp3 — .mp3, .wav or .ogg. Upload the files alongside the workbook."],
  ["Audio Start", "No", "Seconds (e.g. 12.5) or mm:ss (e.g. 1:05). Defaults to 0."],
  ["Audio Duration", "No", "Clip length in seconds, up to 600. Blank plays to the end."],
  ["Explanation", "No", "Shown with the answer reveal (up to 1000 characters)."],
];

export function buildTemplateWorkbook(XLSX: typeof XLSXType): XLSXType.WorkBook {
  const wb = XLSX.utils.book_new();
  const questions = XLSX.utils.aoa_to_sheet([[...TEMPLATE_COLUMNS], ...TEMPLATE_SAMPLE_ROWS]);
  questions["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: c === "Question" || c === "Explanation" ? 42 : Math.max(14, c.length + 2) }));
  XLSX.utils.book_append_sheet(wb, questions, "Questions");
  const instructions = XLSX.utils.aoa_to_sheet(TEMPLATE_INSTRUCTIONS);
  instructions["!cols"] = [{ wch: 22 }, { wch: 32 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");
  return wb;
}
