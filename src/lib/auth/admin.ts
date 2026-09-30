import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerEnv } from "../env";
import { GameError } from "../game/errors";

export const ADMIN_COOKIE = "am_admin";
const SESSION_HOURS = 16;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = createHash("sha256").update(a).digest();
  const bb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ab, bb);
}

export function verifyAdminPassword(password: string): boolean {
  return safeEqual(password, getServerEnv().ADMIN_PASSWORD);
}

export function createAdminToken(now = Date.now()): { value: string; maxAge: number } {
  const exp = now + SESSION_HOURS * 3600_000;
  const payload = `admin.${exp}`;
  return { value: `${payload}.${sign(payload, getServerEnv().ADMIN_SESSION_SECRET)}`, maxAge: SESSION_HOURS * 3600 };
}

export function verifyAdminToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "admin") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = sign(`${parts[0]}.${parts[1]}`, getServerEnv().ADMIN_SESSION_SECRET);
  return safeEqual(parts[2], expected);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}

/** For server components / pages. */
export async function requireAdminPage(next = "/admin"): Promise<void> {
  if (!(await isAdmin())) redirect(`/login?next=${encodeURIComponent(next)}`);
}

/** For route handlers. */
export async function requireAdminApi(): Promise<void> {
  if (!(await isAdmin())) throw new GameError("UNAUTHORIZED", "Please sign in to the organizer dashboard.");
}
