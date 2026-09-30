"use client";

export interface StoredPlayer {
  playerId: string;
  token: string;
  nickname: string;
  sessionId: string;
  pin: string;
  joinedAt: number;
}

const DEVICE_KEY = "am-device-token";
const playerKey = (pin: string) => `am-player:${pin}`;

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    s.setItem("__am_test", "1");
    s.removeItem("__am_test");
    return s;
  } catch {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
}

/** A random per-browser token. Only its SHA-256 hash is stored on the server. */
export function getDeviceToken(): string {
  const s = storage();
  const existing = s?.getItem(DEVICE_KEY);
  if (existing && existing.length >= 32) return existing;
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  s?.setItem(DEVICE_KEY, token);
  return token;
}

export function loadPlayer(pin: string): StoredPlayer | null {
  try {
    const raw = storage()?.getItem(playerKey(pin));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPlayer;
    return parsed.playerId && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

export function savePlayer(player: StoredPlayer) {
  storage()?.setItem(playerKey(player.pin), JSON.stringify(player));
}

export function clearPlayer(pin: string) {
  storage()?.removeItem(playerKey(pin));
}

export function playerHeaders(player: Pick<StoredPlayer, "playerId" | "token">): HeadersInit {
  return { "x-player-id": player.playerId, "x-player-token": player.token };
}
