import { PIN_LENGTH } from "./constants";

const PIN_PATTERN = /^[1-9]\d{5}$/;

/** Six digits, never starting with 0 so it reads cleanly on screen and in URLs. */
export function generatePin(random: () => number = secureRandom): string {
  const min = 10 ** (PIN_LENGTH - 1);
  const span = 9 * min;
  return String(min + Math.floor(random() * span));
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && PIN_PATTERN.test(pin);
}

export function normalizePin(input: string): string {
  return input.replace(/\D/g, "").slice(0, PIN_LENGTH);
}

export function formatPin(pin: string): string {
  return pin.length === PIN_LENGTH ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
}

export function buildJoinUrl(origin: string, pin: string): string {
  return `${origin.replace(/\/+$/, "")}/join/${encodeURIComponent(pin)}`;
}

function secureRandom(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}
