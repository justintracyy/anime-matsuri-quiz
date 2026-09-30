export type GameErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "PIN_NOT_FOUND"
  | "SESSION_ENDED"
  | "SESSION_EXPIRED"
  | "ROOM_FULL"
  | "GAME_STARTED"
  | "NICKNAME_TAKEN"
  | "KICKED"
  | "INVALID_PHASE"
  | "VERSION_CONFLICT"
  | "ALREADY_ANSWERED"
  | "TIME_UP"
  | "PAUSED"
  | "INVALID_CHOICE"
  | "QUESTION_MISMATCH"
  | "QUIZ_NOT_PUBLISHED"
  | "QUIZ_EMPTY"
  | "NO_PLAYERS"
  | "INTERNAL";

const STATUS: Record<GameErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  PIN_NOT_FOUND: 404,
  SESSION_ENDED: 410,
  SESSION_EXPIRED: 410,
  ROOM_FULL: 409,
  GAME_STARTED: 409,
  NICKNAME_TAKEN: 409,
  KICKED: 403,
  INVALID_PHASE: 409,
  VERSION_CONFLICT: 409,
  ALREADY_ANSWERED: 409,
  TIME_UP: 409,
  PAUSED: 409,
  INVALID_CHOICE: 400,
  QUESTION_MISMATCH: 409,
  QUIZ_NOT_PUBLISHED: 400,
  QUIZ_EMPTY: 400,
  NO_PLAYERS: 409,
  INTERNAL: 500,
};

export class GameError extends Error {
  readonly status: number;
  constructor(
    readonly code: GameErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GameError";
    this.status = STATUS[code];
  }
}

/** Constraint violations surfaced by a store implementation. */
export type StoreConflictKind = "ROOM_FULL" | "NICKNAME_TAKEN" | "TOKEN_TAKEN" | "PIN_TAKEN" | "DUPLICATE_ANSWER";

export class StoreConflictError extends Error {
  constructor(readonly kind: StoreConflictKind) {
    super(kind);
    this.name = "StoreConflictError";
  }
}

export function isGameError(error: unknown): error is GameError {
  return error instanceof GameError;
}
