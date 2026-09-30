# Anime Matsuri Guessing Game

A live, Kahoot-style multiplayer anime guessing game for **Anime Matsuri Season 2: Sakura & Spirits**.
The host projects the game on a big screen; up to **50 players** join from their phones by scanning a
QR code, answer with four big buttons and compete for the championship.

- **Organizer dashboard**: build quizzes by hand or import them from Excel, attach images and audio,
  generate silhouettes and blurred images, then publish.
- **Host screen**: lobby with QR code and PIN, live questions with media and timer, answer count,
  reveal with answer distribution, top‑5 leaderboard and a championship screen with podium and petal confetti.
- **Player phones**: join with any nickname (no account), one-handed answer buttons, instant feedback,
  points, rank and streaks, and a final personal result.

Everything runs on Vercel (serverless) + Supabase (Postgres, Realtime, Storage). Authoritative game
state lives in Postgres; all scoring happens on the server.

---

## Contents

1. [Quick start (local)](#quick-start-local)
2. [Supabase setup and migrations](#supabase-setup-and-migrations)
3. [Deploying to Vercel](#deploying-to-vercel)
4. [Running a game night](#running-a-game-night)
5. [Excel import format](#excel-import-format)
6. [Architecture](#architecture)
7. [Security model](#security-model)
8. [Reliability and edge cases](#reliability-and-edge-cases)
9. [Scripts, tests and the 50-player simulation](#scripts-tests-and-the-50-player-simulation)
10. [Project structure](#project-structure)
11. [Troubleshooting](#troubleshooting)

---

## Quick start (local)

Requirements: **Node.js 20.9+** (22 or 24 recommended), npm, and a Supabase project
(free tier is fine; see the next section).

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run dev                     # http://localhost:3000
```

| Variable | Where it comes from | Exposed to browser? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API keys → `anon` (or the new *publishable* key) | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API keys → `service_role` (or the new *secret* key) | **no** |
| `ADMIN_PASSWORD` | Any long password for the organizer login at `/login` | **no** |
| `ADMIN_SESSION_SECRET` | Random string of 32+ characters that signs the organizer cookie | **no** |
| `NEXT_PUBLIC_SITE_URL` | *Optional.* Public URL used in the lobby QR code (e.g. `https://matsuri.example.com`). Defaults to the host browser's origin. | yes |

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If a variable is missing, the dashboard shows a **Setup required** screen that lists exactly what is missing
instead of crashing.

> Testing on phones against your laptop: run `npm run dev -- -H 0.0.0.0`, open the host screen via your
> LAN IP (e.g. `http://192.168.1.20:3000`) so the QR code points to an address phones can reach, or set
> `NEXT_PUBLIC_SITE_URL` to that address.

---

## Supabase setup and migrations

### 1. Create the project

1. Create a project at [supabase.com](https://supabase.com/dashboard). Pick the region closest to the venue
   (and use the same region for Vercel functions).
2. Copy the **Project URL**, **anon/publishable key** and **service_role/secret key** into `.env.local`.

### 2. Apply the database migration

The whole schema lives in [`supabase/migrations/20260930000000_initial_schema.sql`](supabase/migrations/20260930000000_initial_schema.sql).
It creates the tables, indexes, constraints, triggers, RPC functions, row-level security, the Realtime publication
and the private `quiz-media` storage bucket. It is safe to run on a fresh project.

**Option A: Supabase CLI (recommended)**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push            # applies supabase/migrations/*
```

**Option B: SQL editor**

Open *Supabase → SQL Editor → New query*, paste the full contents of the migration file and run it.

### 3. (Optional) Load the sample quiz

[`supabase/seed.sql`](supabase/seed.sql) adds a published five-question warm-up quiz ("Sakura & Spirits Warm-up")
so you can host a game immediately. Paste it into the SQL editor, or with a local stack run `npx supabase db reset`.

### 4. Verify

- **Database → Publications → `supabase_realtime`** lists `game_sessions`, `players` and `question_progress`.
  (The migration adds them. If Realtime was disabled when you ran it, enable the three tables here.)
- **Storage** has a private bucket named `quiz-media` with a 15 MB limit and PNG/JPG/WebP/MP3/WAV/OGG MIME types.
- **Authentication** needs no configuration: players are anonymous and organizers use `ADMIN_PASSWORD`.

### Schema overview

| Table | Purpose |
| --- | --- |
| `quizzes`, `rounds`, `questions`, `choices` | Quiz content. Saved atomically by `save_quiz_content(uuid, jsonb)`. |
| `game_sessions` | One row per live game: PIN, phase, current question, server timestamps, settings, `state_version`. |
| `players` | Nickname, device-token hash, score, streak, correct count, total correct response time, connection status. |
| `player_answers` | One row per player per question (unique), with server-computed `response_time_ms` and `points_awarded`. |
| `question_progress` | Live answer count per question (maintained by a trigger) so the host can show "12 / 30 answered". |

Key constraints enforced **in the database**:

- A PIN is unique among live games (partial unique index), and six digits (`^[1-9][0-9]{5}$`).
- A nickname is unique per game (case-insensitive, ignoring removed players).
- There is exactly one answer per player per question (`unique (game_session_id, player_id, question_id)`).
- A game holds at most 50 players: the `enforce_player_capacity` trigger locks the session row, so simultaneous
  joins can't exceed the cap.

To change the schema later, add a new file in `supabase/migrations/` (e.g. `npx supabase migration new add_x`) and
run `npx supabase db push` again.

---

## Deploying to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Vercel: **Add New → Project → Import** the repository. The framework preset is detected as **Next.js**;
   leave the build command (`next build`) and output settings at their defaults.
3. Under **Settings → Environment Variables**, add all variables from the table above for *Production*
   (and *Preview* if you want preview deployments to work). Set `NEXT_PUBLIC_SITE_URL` to your production
   domain so QR codes always point there, even when the host screen is opened from a preview URL.
4. **Settings → Functions → Region**: choose the region closest to your Supabase project.
5. Deploy. Visit `https://<your-domain>/login`, sign in with `ADMIN_PASSWORD`, and create or open a quiz.

Notes:

- There is no in-memory server state, so any number of serverless instances can serve the game.
- Media uploads go **directly from the browser to Supabase Storage** using signed upload URLs, which
  avoids Vercel's request-body limit. Files are read through short-lived signed URLs.
- After changing `NEXT_PUBLIC_*` variables, redeploy; they are inlined at build time.

---

## Running a game night

1. **Log in** at `/login`.
2. **Create a quiz** on the dashboard, then add rounds and questions in the editor:
   round, type, prompt, four choices, correct answer, time limit, ×1/×2/×3 multiplier, explanation, image and audio.
   - Images (PNG/JPG/WebP) get crop and position controls. SILHOUETTE questions generate a black silhouette
     automatically, BLURRED_IMAGE questions generate a blurred version, and the original is shown at the reveal.
   - Audio (MP3/WAV/OGG) gets a waveform with start/end handles, a preview, and a "players may replay" toggle.
3. **Or import from Excel**: *Import Excel* → download the template → fill it in → upload the workbook and the
   media files it references. Every row is validated and shown in a preview with its errors. Valid rows are
   added to the editor; nothing is saved until you press **Save**.
4. **Batch silhouettes** (*Silhouettes* in the header): drop many images, tune the white threshold, clean up
   edges with the brush, then download PNG/ZIP or attach a silhouette straight to a question.
   *Transparent PNG images provide the best results.*
5. **Publish** the quiz, then click **Host live game**. A PIN is generated and the lobby opens.
6. Put the host screen on the projector (use the full-screen button). Players scan the QR code
   (`https://<domain>/join/<pin>`) or type the PIN at `/join`.
7. Host controls: **Start game → Start question → (Pause / Resume / End early / Skip) → Reveal answer → Show leaderboard → Next question**,
   ending with the **championship** screen. Keyboard: `Space`/`Enter`/`→` moves to the next step, `P` pauses and resumes.
   Skip, remove player, end game and restart all ask for confirmation.
8. **Settings** (gear icon): allow late joining; mirror question text and media to players' phones.

Scoring: correct = **500 + up to 500 speed bonus** (linear in remaining time), × round multiplier.
Wrong or no answer = 0. Ties are broken by the lowest total response time across correct answers.

---

## Excel import format

Sheet name `Questions` (or the first sheet), header row in row 1:

| Column | Required | Notes |
| --- | --- | --- |
| Round | no | Name or number; rows with the same value become one round. Default "Round 1". |
| Question Type | yes | `SILHOUETTE`, `OPENING_AUDIO`, `VOICE_AUDIO`, `BLURRED_IMAGE`, `EMOJI`, `QUOTE`, `SCENE`, `TRIVIA` (case and spaces are forgiven). |
| Question | yes | Up to 500 characters. For EMOJI put the emojis here. |
| Choice A … Choice D | A and B | Up to 120 characters each. C and D are optional. |
| Correct Answer | yes | `A`–`D` (also accepts `Choice B`), must point to a filled-in choice. |
| Time Limit | no | 5–240 seconds (`20`, `20s`). Default 20 (25 for audio). |
| Point Multiplier | no | 1, 2 or 3 (`2x` also works). |
| Image File Name | image types | `.png`, `.jpg`, `.jpeg`, `.webp`. Required for SILHOUETTE, BLURRED_IMAGE and SCENE. |
| Audio File Name | audio types | `.mp3`, `.wav`, `.ogg`. Required for OPENING_AUDIO and VOICE_AUDIO. |
| Audio Start | no | Seconds (`12.5`) or `m:ss` (`1:05`). |
| Audio Duration | no | Clip length in seconds; blank plays to the end. |
| Explanation | no | Shown at the reveal. |

Each problem is reported with its **row number, column, current value and how to fix it**. Media is matched by file
name (case-insensitive). Files that are referenced but not uploaded are flagged as missing and can be attached
later in the question editor; publishing warns about questions that still lack media.

---

## Architecture

```
Phones (players) ──HTTP──▶ /api/games/*, /api/play/*  ─┐
                  ◀─Realtime (postgres_changes)──┐      │   GameService (src/lib/game/service.ts)
Host screen ─────HTTP──▶ /api/admin/sessions/*  ─┼──────┼─▶  └─ SupabaseGameStore ──▶ Postgres
                  ◀─Realtime──────────────────────┘      │                              ├─ triggers / RPCs
Dashboard ───────HTTP──▶ /api/admin/quizzes/* ──────────┘                              └─ Realtime publication
          ───signed upload URL──▶ Supabase Storage (private bucket)
```

- **Server-authoritative state machine.** A game moves through
  `lobby → ready → active ⇄ paused → closed → results → leaderboard → … → final`.
  Every host action is a compare-and-set on `game_sessions.state_version`, so double-clicks or two host tabs
  cannot skip questions (the second click gets `VERSION_CONFLICT` and the screen refreshes).
- **Server time only.** `question_started_at` / `question_ends_at` are set by the server. Response time is
  `server receive time − question_started_at` (pause time is excluded). A 750 ms grace period absorbs network
  latency. Clients estimate their clock offset from `serverNow` in every response so countdowns match the server.
- **Timer expiry.** After `question_ends_at` the question is treated as closed everywhere, even before anything
  is written. The host screen then persists the close, and the server also closes the question automatically
  once every player has answered.
- **Scoring.** Points are computed in `submitAnswer` and stored on the answer row. Player totals are
  recomputed from answers to *revealed* questions only (`computeStandings`, applied by the `apply_player_standings`
  RPC before the reveal is committed), so the public players table never hints at correctness early.
- **Realtime.** Players subscribe to their `game_sessions` row and their own `players` row. When `state_version`
  changes they fetch a sanitized view from the API (with 0–250 ms jitter so 50 phones don't stampede).
  The host also subscribes to `players` (lobby, disconnects) and `question_progress` (answer count).
  If Realtime drops, a banner appears and clients fall back to polling until it reconnects.
- **Testability.** `GameService` depends on a `GameStore` interface. Production uses `SupabaseGameStore`; tests and
  the simulation use `MemoryGameStore`, which mirrors the database constraints, with an injectable clock.

---

## Security model

- The browser **never talks to quiz tables directly.** All reads and writes go through route handlers that use the
  service-role key on the server.
- Row-level security is enabled on every table. Browser roles (`anon`, `authenticated`) can only `SELECT`
  `game_sessions`, `question_progress` and a column subset of `players` (no token hash), which is what Realtime needs.
  `quizzes`, `questions`, `choices` and `player_answers` have **no policies**, so players can never read correct
  answers, other players' answers or unpublished quizzes, even with the anon key.
- The player API views are sanitized: no `correctChoiceId` or explanation before the reveal, and no question text
  or media unless the host enabled mirroring.
- Players are anonymous. The browser generates a random device token, stored in localStorage. The server stores
  only its SHA-256 hash and checks it in constant time on every player request.
- Organizer pages and APIs require an HMAC-signed, HTTP-only cookie issued after the `ADMIN_PASSWORD` login.
- Uploads: signed upload URLs are issued only to organizers, for allow-listed MIME types and extensions, up to 15 MB,
  into a private bucket. The bucket itself enforces the same limits.
- `save_quiz_content` and `apply_player_standings` are executable by `service_role` only.

---

## Reliability and edge cases

| Situation | Behaviour |
| --- | --- |
| Player refreshes / phone sleeps | Same device token → same player, score and answer restored; heartbeat marks them connected again. |
| Host refreshes or opens another device | The whole state comes from the database; the timer resumes from server timestamps. |
| Duplicate nickname | Rejected with a suggestion ("Kitsune 2"), case-insensitive. |
| Duplicate answer / double tap / retry | The first answer counts; later submissions return the original answer, even after the question closes. |
| Late join | Blocked with a clear message unless the host enables *Allow late joining*. |
| Room full | The 51st player gets "This game is full", enforced by a database trigger. |
| Game ended or PIN expired (12 h) | Join screen explains and asks for a new PIN. |
| Missing image or audio | The question still plays, with an "image/audio unavailable" placeholder; publishing warns in advance. |
| Invalid Excel rows | Listed with row, column, value and fix. Only valid rows can be imported. |
| Realtime connection failure | "Reconnecting…" banner with a retry button; automatic fallback polling (every 3–4 s). |
| Network error while answering | Automatic retries with backoff; the answer is idempotent. |
| Removed player | Their phone shows they were removed; they can't rejoin from the same device. |

---

## Scripts, tests and the 50-player simulation

```bash
npm run lint          # ESLint (flat config, next/core-web-vitals + TypeScript)
npm run typecheck     # next typegen && tsc --noEmit
npm run test          # Vitest unit + integration tests
npm run check         # all three
npm run simulate      # 50-player game against the real GameService, in memory
npm run simulate:live # 50 players over HTTP against a running app + Supabase
```

The test suite (`tests/`) covers quiz creation, manual question creation and validation, Excel template, import
and validation, media matching, PIN generation, QR join URLs, joining, nickname rules, 50-player capacity,
late join, expired and ended games, starting questions, answer submission, duplicate answer rejection,
server-side scoring and multipliers, timer expiration and grace period, pause/resume, stale host actions,
skipping, leaderboard ranking and tie-breaks, host refresh recovery, player reconnect, restart, the
winner calculation, silhouette/blur/crop image processing, and a full **50-player simulation** with
concurrent joins, double taps and late answers.

**Live simulation** creates a temporary published quiz, hosts it, joins 50 players concurrently over HTTP,
answers (including duplicate taps), checks every player's points against the scoring formula, plays to the
championship and deletes the quiz:

```bash
npm run dev                                   # in one terminal (or deploy)
SIM_BASE_URL=http://localhost:3000 npm run simulate:live
# PowerShell: $env:SIM_BASE_URL="https://your-app.vercel.app"; npm run simulate:live
```

It reads `ADMIN_PASSWORD` from the environment or `.env.local`. Set `SIM_PLAYERS` to use fewer players and
`SIM_KEEP=1` to keep the quiz afterwards.

---

## Project structure

```
src/
  app/
    page.tsx                    landing page
    join/, join/[pin]/          PIN entry and nickname form (QR target)
    play/[pin]/                 player game screen
    login/                      organizer login
    admin/                      dashboard, quiz editor, Excel import, silhouette studio
    host/[sessionId]/           host / projector screen
    api/                        route handlers (admin, games, play, template)
  components/
    brand/                      logo, original sakura / lantern / spirit decorations
    game/                       timer, choices, media, leaderboard, championship, connection banner
    host/                       host screen
    player/                     join flow and player screens
    admin/, media/              editor, import wizard, image processor, audio clip editor
    ui/                         shadcn-style primitives (Radix)
  hooks/                        realtime subscription, countdown
  lib/
    game/                       GameService, stores, phases, types, errors
    excel/                      template + import validation (SheetJS)
    image/                      pixel algorithms (silhouette, blur, crop) + canvas helpers
    quiz/                       Zod schemas, repository
    scoring.ts, pin.ts, nickname.ts, storage.ts, env.ts, auth/
supabase/
  migrations/                   schema, RLS, triggers, RPCs, realtime, storage bucket
  seed.sql                      sample quiz
scripts/                        simulation (in-memory and live)
tests/                          Vitest suites
```

---

## Troubleshooting

- **"Setup required" screen.** One or more environment variables are missing or invalid; the screen lists which.
  On Vercel, add them and redeploy.
- **Players stuck on "Reconnecting…".** Check that the three tables are in the `supabase_realtime` publication and
  that `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct. The game keeps working via polling in the meantime.
- **QR code opens the wrong address.** Set `NEXT_PUBLIC_SITE_URL` to the public domain and redeploy.
- **Uploads fail.** Confirm the `quiz-media` bucket exists (re-run the storage section of the migration) and the
  file is PNG/JPG/WebP/MP3/WAV/OGG under 15 MB.
- **Audio doesn't autoplay on the host screen.** Browsers block autoplay until the page has been interacted with.
  Click anywhere once, or press the play button on the clip.
- **"The game changed on another screen."** Two host tabs or a double-click raced; the screen refreshes to the
  latest state automatically. Nothing was skipped.
