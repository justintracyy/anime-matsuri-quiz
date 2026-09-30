"use client";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isNetwork() {
    return this.code === "NETWORK";
  }
}

let clockOffsetMs = 0;
let bestRoundTrip = Number.POSITIVE_INFINITY;

/** Server time estimate (ms since epoch), corrected for this device's clock skew. */
export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

export function getClockOffset(): number {
  return clockOffsetMs;
}

/**
 * NTP-style offset: prefer samples with the shortest round trip, but let the
 * estimate drift slowly so a single slow response can't skew it.
 */
export function recordServerTime(serverMs: number, sentAt: number, receivedAt: number) {
  const rtt = Math.max(0, receivedAt - sentAt);
  const offset = serverMs - (sentAt + rtt / 2);
  if (!Number.isFinite(bestRoundTrip) || rtt < bestRoundTrip) {
    bestRoundTrip = rtt;
    clockOffsetMs = offset;
  } else if (rtt <= bestRoundTrip * 2 + 50) {
    clockOffsetMs = clockOffsetMs * 0.8 + offset * 0.2;
  }
  // Let the best sample age so the estimate adapts when the network changes.
  bestRoundTrip *= 1.05;
}

export async function apiFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const sentAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      cache: "no-store",
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError("NETWORK", "Can't reach the game server. Check your connection — we'll keep retrying.", 0);
  }
  const receivedAt = Date.now();
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON response
  }
  if (!response.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(err?.code ?? "HTTP_" + response.status, err?.message ?? `Request failed (${response.status}).`, response.status, err?.details);
  }
  const serverMs = (body as { serverNow?: number } | null)?.serverNow;
  if (typeof serverMs === "number") recordServerTime(serverMs, sentAt, receivedAt);
  return body as T;
}
