import { z } from "zod";
import { NICKNAME_MAX_LENGTH } from "./constants";

// Strip control characters and collapse whitespace.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\uFEFF]/g;

export function cleanNickname(input: string): string {
  return input.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

export function nicknameKey(nickname: string): string {
  return cleanNickname(nickname).toLowerCase();
}

export const nicknameSchema = z
  .string()
  .transform(cleanNickname)
  .pipe(
    z
      .string()
      .min(1, "Please enter a nickname.")
      .max(NICKNAME_MAX_LENGTH, `Nicknames can be up to ${NICKNAME_MAX_LENGTH} characters.`),
  );

/** Suggest "Name 2", "Name 3", … that is not already taken. */
export function suggestNickname(nickname: string, taken: Iterable<string>): string {
  const takenKeys = new Set([...taken].map(nicknameKey));
  const base = cleanNickname(nickname);
  for (let n = 2; n < 1000; n++) {
    const suffix = ` ${n}`;
    const candidate = `${base.slice(0, NICKNAME_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!takenKeys.has(nicknameKey(candidate))) return candidate;
  }
  return `${base.slice(0, NICKNAME_MAX_LENGTH - 5)} ${Math.floor(Math.random() * 9000 + 1000)}`;
}
