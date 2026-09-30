export const EVENT_NAME = "Anime Matsuri Season 2";
export const EVENT_THEME = "Sakura & Spirits";
export const EVENT_FULL_NAME = `${EVENT_NAME}: ${EVENT_THEME}`;
export const GAME_NAME = "Anime Matsuri Guessing Game";

export const MAX_PLAYERS = 50;
export const PIN_LENGTH = 6;
export const NICKNAME_MAX_LENGTH = 20;
export const SESSION_TTL_HOURS = 12;

export const BASE_POINTS = 500;
export const MAX_SPEED_BONUS = 500;
/** Answers arriving slightly after the deadline (network latency) are still accepted. */
export const ANSWER_GRACE_MS = 750;
/** Players who have not sent a heartbeat for this long are shown as disconnected. */
export const PLAYER_STALE_MS = 45_000;
export const HEARTBEAT_INTERVAL_MS = 20_000;

export const QUESTION_TYPES = [
  "SILHOUETTE",
  "OPENING_AUDIO",
  "VOICE_AUDIO",
  "BLURRED_IMAGE",
  "EMOJI",
  "QUOTE",
  "SCENE",
  "TRIVIA",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_INFO: Record<
  QuestionType,
  { label: string; description: string; needsImage: boolean; needsAudio: boolean; imageEffect: "silhouette" | "blur" | "none" }
> = {
  SILHOUETTE: {
    label: "Character silhouette",
    description: "Show a black silhouette, reveal the original image with the answer.",
    needsImage: true,
    needsAudio: false,
    imageEffect: "silhouette",
  },
  OPENING_AUDIO: {
    label: "Anime opening audio",
    description: "Play a clip of an opening theme.",
    needsImage: false,
    needsAudio: true,
    imageEffect: "none",
  },
  VOICE_AUDIO: {
    label: "Voice-line audio",
    description: "Play a character voice line.",
    needsImage: false,
    needsAudio: true,
    imageEffect: "none",
  },
  BLURRED_IMAGE: {
    label: "Blurred image",
    description: "Show a blurred image, reveal the sharp original with the answer.",
    needsImage: true,
    needsAudio: false,
    imageEffect: "blur",
  },
  EMOJI: {
    label: "Emoji guess",
    description: "Guess the anime from an emoji sequence.",
    needsImage: false,
    needsAudio: false,
    imageEffect: "none",
  },
  QUOTE: {
    label: "Character quote",
    description: "Guess who said the quote.",
    needsImage: false,
    needsAudio: false,
    imageEffect: "none",
  },
  SCENE: {
    label: "Guess the anime from a scene",
    description: "Show a still from a scene.",
    needsImage: true,
    needsAudio: false,
    imageEffect: "none",
  },
  TRIVIA: {
    label: "Standard anime trivia",
    description: "A classic multiple-choice question.",
    needsImage: false,
    needsAudio: false,
    imageEffect: "none",
  },
};

export const CHOICE_LABELS = ["A", "B", "C", "D"] as const;
export type ChoiceLabel = (typeof CHOICE_LABELS)[number];

export const MULTIPLIERS = [1, 2, 3] as const;
export type Multiplier = (typeof MULTIPLIERS)[number];

export const MULTIPLIER_LABEL: Record<number, string> = {
  1: "Regular",
  2: "Double points",
  3: "Triple points",
};

/** Answer button styling — each choice has a colour and a shape so it is not colour-only. */
export const CHOICE_STYLES: Record<ChoiceLabel, { bg: string; ring: string; shape: string; name: string }> = {
  A: { bg: "bg-[#E991A0]", ring: "ring-[#E991A0]", shape: "✿", name: "Sakura" },
  B: { bg: "bg-[#8D6E95]", ring: "ring-[#8D6E95]", shape: "◆", name: "Lavender" },
  C: { bg: "bg-[#D8A56D]", ring: "ring-[#D8A56D]", shape: "●", name: "Gold" },
  D: { bg: "bg-[#6E4F74]", ring: "ring-[#6E4F74]", shape: "▲", name: "Plum" },
};

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/ogg",
] as const;
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;
export const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg"] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MEDIA_BUCKET = "quiz-media";

export const SILHOUETTE_TIP = "Transparent PNG images provide the best results.";
