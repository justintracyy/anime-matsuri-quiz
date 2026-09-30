/**
 * Checks that the Supabase project is set up for the game:
 *   npm run verify:supabase
 * Reads .env.local. Makes no changes except a temporary storage upload test.
 */
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to the process environment
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!rawUrl || !anonKey || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}
const url = new URL(rawUrl).origin;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

let failures = 0;
function report(ok: boolean, label: string, hint?: string) {
  if (!ok) failures += 1;
  console.log(`${ok ? "✔" : "✘"} ${label}${!ok && hint ? `\n    → ${hint}` : ""}`);
}

const TABLES = ["quizzes", "rounds", "questions", "choices", "game_sessions", "players", "player_answers", "question_progress"];
const MIGRATION_HINT = "Run supabase/migrations/20260930000000_initial_schema.sql in the Supabase SQL editor.";

async function main() {
  console.log(`Checking ${url}\n`);

  const ping = await admin.from("quizzes").select("id", { count: "exact", head: true });
  if (ping.error && /Invalid API key|JWT|apikey/i.test(ping.error.message)) {
    report(false, "Service role / secret key accepted", "Copy the service_role (or secret) key again from Project Settings → API Keys.");
    return;
  }

  for (const table of TABLES) {
    const { error } = await admin.from(table).select("*", { count: "exact", head: true });
    report(!error, `Table public.${table}`, error ? `${error.message}. ${MIGRATION_HINT}` : undefined);
  }

  const rpc = await admin.rpc("apply_player_standings", { p_session_id: "00000000-0000-0000-0000-000000000000", p_rows: [] });
  report(!rpc.error, "Function apply_player_standings", rpc.error ? `${rpc.error.message}. ${MIGRATION_HINT}` : undefined);

  const { data: quizzes } = await admin.from("quizzes").select("title, status");
  const published = (quizzes ?? []).filter((q) => q.status === "published");
  report(published.length > 0, `Published quiz available (${(quizzes ?? []).map((q) => `"${q.title}"`).join(", ") || "none"})`, "Run supabase/seed.sql in the SQL editor, or create and publish a quiz in the dashboard.");

  const secretRead = await anon.from("choices").select("id").limit(1);
  report(!secretRead.error ? (secretRead.data ?? []).length === 0 : true, "Public key cannot read answer choices (RLS)");
  const answersRead = await anon.from("questions").select("correct_choice_id").limit(1);
  report(!answersRead.error ? (answersRead.data ?? []).length === 0 : true, "Public key cannot read correct answers (RLS)");
  const tokenRead = await anon.from("players").select("token_hash").limit(1);
  report(!!tokenRead.error, "Public key cannot read player token hashes");
  const stateRead = await anon.from("game_sessions").select("id").limit(1);
  report(!stateRead.error, "Public key can read game state (needed for realtime)", stateRead.error?.message);

  const { data: bucket, error: bucketError } = await admin.storage.getBucket("quiz-media");
  report(!!bucket && !bucket.public, "Private storage bucket quiz-media", bucketError?.message ?? "Re-run the storage section at the end of the migration.");
  if (bucket) {
    const path = `_verify/${Date.now()}.png`;
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
    const up = await admin.storage.from("quiz-media").upload(path, png, { contentType: "image/png" });
    report(!up.error, "Storage upload works", up.error?.message);
    if (!up.error) await admin.storage.from("quiz-media").remove([path]);
  }

  // Realtime: subscribe as the browser would and wait for the channel to join.
  const status = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), 15_000);
    const channel = anon
      .channel(`verify-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_sessions" }, () => {})
      .subscribe((s) => {
        if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          clearTimeout(timer);
          void anon.removeChannel(channel);
          resolve(s);
        }
      });
  });
  report(status === "SUBSCRIBED", `Realtime subscription (${status})`, "Check Database → Publications → supabase_realtime includes game_sessions, players and question_progress.");
}

main()
  .catch((error) => {
    failures += 1;
    console.error(error);
  })
  .finally(() => {
    console.log(failures ? `\n${failures} check(s) failed.` : "\nSupabase is ready for the game.");
    process.exit(failures ? 1 : 0);
  });
