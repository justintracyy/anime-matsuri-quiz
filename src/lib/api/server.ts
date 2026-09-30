import "server-only";
import { z } from "zod";
import { EnvError } from "../env";
import { GameError } from "../game/errors";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof GameError) {
    return json<ApiErrorBody>(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof z.ZodError) {
    return json<ApiErrorBody>(
      {
        error: {
          code: "VALIDATION",
          message: error.issues[0]?.message ?? "Invalid request.",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof EnvError) {
    console.error(error.message);
    return json<ApiErrorBody>(
      { error: { code: "CONFIG", message: "The server is not configured yet. See the README setup steps.", details: error.issues } },
      { status: 503 },
    );
  }
  console.error("[api] unexpected error", error);
  return json<ApiErrorBody>(
    { error: { code: "INTERNAL", message: "Something went wrong on the server. Please try again." } },
    { status: 500 },
  );
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new GameError("VALIDATION", "Request body must be JSON.");
  }
  return schema.parse(body);
}

export function playerCredentials(request: Request): { playerId: string; token: string } {
  const playerId = request.headers.get("x-player-id") ?? "";
  const token = request.headers.get("x-player-token") ?? "";
  if (!playerId || !token) throw new GameError("UNAUTHORIZED", "Your player session is missing. Please join again.");
  return { playerId, token };
}
