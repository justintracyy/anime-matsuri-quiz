import "server-only";
import { getSupabaseAdmin } from "../supabase/admin";
import { GameService } from "./service";
import { SupabaseGameStore } from "./supabase-store";

let service: GameService | null = null;

/** Stateless service over the database — safe to reuse across serverless invocations. */
export function getGameService(): GameService {
  if (!service) service = new GameService({ store: new SupabaseGameStore(getSupabaseAdmin()) });
  return service;
}
