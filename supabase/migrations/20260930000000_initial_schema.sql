-- Anime Matsuri Season 2: Sakura & Spirits — live guessing game schema.
--
-- Security model
--   * All writes go through Next.js route handlers that use the service-role key.
--   * The browser (anon / publishable key) can only SELECT the minimum needed for
--     Supabase Realtime: game_sessions, a column subset of players, and
--     question_progress (answer counts). Quizzes, questions, choices (and therefore
--     correct answers) and player_answers are never readable by the browser.

create extension if not exists pgcrypto;

-- ───────────────────────────────────────────────────────────────────────────
-- Helpers
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Quiz content
-- ───────────────────────────────────────────────────────────────────────────
create table public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  subtitle    text check (subtitle is null or char_length(subtitle) <= 200),
  description text check (description is null or char_length(description) <= 2000),
  status      text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger quizzes_set_updated_at
  before update on public.quizzes
  for each row execute function public.set_updated_at();

create table public.rounds (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes (id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 1 and 120),
  position   integer not null default 0 check (position >= 0),
  multiplier integer not null default 1 check (multiplier in (1, 2, 3))
);

create index rounds_quiz_id_position_idx on public.rounds (quiz_id, position);

create table public.questions (
  id                     uuid primary key default gen_random_uuid(),
  round_id               uuid not null references public.rounds (id) on delete cascade,
  type                   text not null check (type in (
                           'SILHOUETTE', 'OPENING_AUDIO', 'VOICE_AUDIO', 'BLURRED_IMAGE',
                           'EMOJI', 'QUOTE', 'SCENE', 'TRIVIA')),
  prompt                 text not null check (char_length(btrim(prompt)) between 1 and 500),
  correct_choice_id      uuid,
  time_limit_seconds     integer not null default 20 check (time_limit_seconds between 5 and 240),
  base_points            integer not null default 500 check (base_points between 0 and 5000),
  multiplier             integer not null default 1 check (multiplier in (1, 2, 3)),
  explanation            text check (explanation is null or char_length(explanation) <= 1000),
  position               integer not null default 0 check (position >= 0),
  -- Image shown while the question is live (silhouette / blurred / cropped original).
  media_path             text,
  -- Unaltered image revealed with the answer.
  original_media_path    text,
  audio_path             text,
  audio_start_seconds    numeric(8, 2) not null default 0 check (audio_start_seconds >= 0),
  audio_duration_seconds numeric(8, 2) check (audio_duration_seconds is null or audio_duration_seconds > 0),
  allow_audio_replay     boolean not null default true,
  -- File names referenced by an Excel import, used to match separately uploaded media.
  image_file_name        text,
  audio_file_name        text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index questions_round_id_position_idx on public.questions (round_id, position);

create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

create table public.choices (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  label       text not null check (label in ('A', 'B', 'C', 'D')),
  text        text not null check (char_length(btrim(text)) between 1 and 120),
  position    integer not null check (position between 0 and 3),
  constraint choices_question_label_key unique (question_id, label) deferrable initially deferred
);

create index choices_question_id_idx on public.choices (question_id);

alter table public.questions
  add constraint questions_correct_choice_id_fkey
  foreign key (correct_choice_id) references public.choices (id)
  on delete set null deferrable initially deferred;

-- ───────────────────────────────────────────────────────────────────────────
-- Live game state (authoritative — serverless functions keep no memory)
-- ───────────────────────────────────────────────────────────────────────────
create table public.game_sessions (
  id                     uuid primary key default gen_random_uuid(),
  quiz_id                uuid not null references public.quizzes (id) on delete cascade,
  game_pin               text not null check (game_pin ~ '^[1-9][0-9]{5}$'),
  status                 text not null default 'lobby' check (status in ('lobby', 'in_progress', 'finished')),
  phase                  text not null default 'lobby' check (phase in (
                           'lobby', 'ready', 'active', 'paused', 'closed', 'results', 'leaderboard', 'final')),
  current_round_index    integer not null default 0,
  current_question_index integer not null default -1,
  question_started_at    timestamptz,
  question_ends_at       timestamptz,
  paused_remaining_ms    integer,
  show_results           boolean not null default false,
  question_order         uuid[] not null default '{}',
  revealed_question_ids  uuid[] not null default '{}',
  skipped_question_ids   uuid[] not null default '{}',
  allow_late_join        boolean not null default false,
  mirror_to_players      boolean not null default false,
  max_players            integer not null default 50 check (max_players between 1 and 50),
  state_version          integer not null default 0,
  created_at             timestamptz not null default now(),
  ended_at               timestamptz,
  expires_at             timestamptz not null default (now() + interval '12 hours')
);

-- A PIN is unique among games that have not finished.
create unique index game_sessions_live_pin_key on public.game_sessions (game_pin) where status <> 'finished';
create index game_sessions_game_pin_idx on public.game_sessions (game_pin, created_at desc);
create index game_sessions_quiz_id_idx on public.game_sessions (quiz_id);

create table public.players (
  id                          uuid primary key default gen_random_uuid(),
  game_session_id             uuid not null references public.game_sessions (id) on delete cascade,
  nickname                    text not null check (char_length(btrim(nickname)) between 1 and 20),
  -- SHA-256 of the random device token kept in the player's browser storage.
  token_hash                  text not null,
  score                       integer not null default 0,
  streak                      integer not null default 0,
  best_streak                 integer not null default 0,
  correct_answer_count        integer not null default 0,
  total_correct_response_time bigint not null default 0,
  last_points                 integer not null default 0,
  connected                   boolean not null default true,
  kicked                      boolean not null default false,
  joined_at                   timestamptz not null default now(),
  last_seen_at                timestamptz not null default now()
);

create index players_game_session_id_idx on public.players (game_session_id);
create unique index players_session_token_key on public.players (game_session_id, token_hash);
create unique index players_session_nickname_key on public.players (game_session_id, lower(btrim(nickname))) where not kicked;

create table public.player_answers (
  id                 uuid primary key default gen_random_uuid(),
  game_session_id    uuid not null references public.game_sessions (id) on delete cascade,
  player_id          uuid not null references public.players (id) on delete cascade,
  question_id        uuid not null references public.questions (id) on delete cascade,
  selected_choice_id uuid references public.choices (id) on delete set null,
  is_correct         boolean not null default false,
  submitted_at       timestamptz not null default now(),
  response_time_ms   integer not null check (response_time_ms >= 0),
  points_awarded     integer not null default 0 check (points_awarded >= 0),
  constraint player_answers_one_per_question unique (game_session_id, player_id, question_id)
);

create index player_answers_session_question_idx on public.player_answers (game_session_id, question_id);
create index player_answers_player_id_idx on public.player_answers (player_id);
create index player_answers_question_id_idx on public.player_answers (question_id);

-- Answer counts only (no choices, no correctness) so the host can watch progress live.
create table public.question_progress (
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  question_id     uuid not null references public.questions (id) on delete cascade,
  answer_count    integer not null default 0,
  primary key (game_session_id, question_id)
);

-- ───────────────────────────────────────────────────────────────────────────
-- Integrity triggers
-- ───────────────────────────────────────────────────────────────────────────

-- Room capacity. Locks the session row so concurrent joins are serialised.
create or replace function public.enforce_player_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max   integer;
  v_count integer;
begin
  select max_players into v_max
    from public.game_sessions
   where id = new.game_session_id
     for update;

  if v_max is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*) into v_count
    from public.players
   where game_session_id = new.game_session_id
     and not kicked;

  if v_count >= v_max then
    raise exception 'ROOM_FULL' using errcode = 'P0001', detail = format('capacity %s', v_max);
  end if;

  return new;
end;
$$;

create trigger players_enforce_capacity
  before insert on public.players
  for each row execute function public.enforce_player_capacity();

create or replace function public.bump_question_progress()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.question_progress (game_session_id, question_id, answer_count)
  values (new.game_session_id, new.question_id, 1)
  on conflict (game_session_id, question_id)
  do update set answer_count = public.question_progress.answer_count + 1;
  return new;
end;
$$;

create trigger player_answers_bump_progress
  after insert on public.player_answers
  for each row execute function public.bump_question_progress();

-- ───────────────────────────────────────────────────────────────────────────
-- Server-only RPCs (service role)
-- ───────────────────────────────────────────────────────────────────────────

-- Atomically replace a quiz's rounds / questions / choices while keeping IDs stable.
create or replace function public.save_quiz_content(p_quiz_id uuid, p_content jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  r             jsonb;
  q             jsonb;
  c             jsonb;
  r_pos         integer := 0;
  q_pos         integer;
  c_pos         integer;
  v_round_id    uuid;
  v_question_id uuid;
  v_round_ids   uuid[] := '{}';
  v_question_ids uuid[] := '{}';
  v_choice_ids  uuid[];
begin
  if not exists (select 1 from public.quizzes where id = p_quiz_id) then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.quizzes
     set title       = btrim(p_content ->> 'title'),
         subtitle    = nullif(btrim(coalesce(p_content ->> 'subtitle', '')), ''),
         description = nullif(btrim(coalesce(p_content ->> 'description', '')), '')
   where id = p_quiz_id;

  for r in select value from jsonb_array_elements(coalesce(p_content -> 'rounds', '[]'::jsonb)) loop
    v_round_id := (r ->> 'id')::uuid;

    insert into public.rounds (id, quiz_id, title, position, multiplier)
    values (v_round_id, p_quiz_id, btrim(r ->> 'title'), r_pos, coalesce((r ->> 'multiplier')::integer, 1))
    on conflict (id) do update
      set title = excluded.title, position = excluded.position, multiplier = excluded.multiplier
      where public.rounds.quiz_id = p_quiz_id;

    if not found then
      raise exception 'ROUND_ID_CONFLICT' using errcode = 'P0001';
    end if;

    v_round_ids := v_round_ids || v_round_id;
    q_pos := 0;

    for q in select value from jsonb_array_elements(coalesce(r -> 'questions', '[]'::jsonb)) loop
      v_question_id := (q ->> 'id')::uuid;

      insert into public.questions (
        id, round_id, type, prompt, time_limit_seconds, base_points, multiplier, explanation, position,
        media_path, original_media_path, audio_path, audio_start_seconds, audio_duration_seconds,
        allow_audio_replay, image_file_name, audio_file_name
      ) values (
        v_question_id, v_round_id, q ->> 'type', btrim(q ->> 'prompt'),
        (q ->> 'time_limit_seconds')::integer,
        coalesce((q ->> 'base_points')::integer, 500),
        coalesce((q ->> 'multiplier')::integer, 1),
        nullif(btrim(coalesce(q ->> 'explanation', '')), ''),
        q_pos,
        nullif(q ->> 'media_path', ''),
        nullif(q ->> 'original_media_path', ''),
        nullif(q ->> 'audio_path', ''),
        coalesce((q ->> 'audio_start_seconds')::numeric, 0),
        nullif(q ->> 'audio_duration_seconds', '')::numeric,
        coalesce((q ->> 'allow_audio_replay')::boolean, true),
        nullif(q ->> 'image_file_name', ''),
        nullif(q ->> 'audio_file_name', '')
      )
      on conflict (id) do update set
        round_id               = excluded.round_id,
        type                   = excluded.type,
        prompt                 = excluded.prompt,
        time_limit_seconds     = excluded.time_limit_seconds,
        base_points            = excluded.base_points,
        multiplier             = excluded.multiplier,
        explanation            = excluded.explanation,
        position               = excluded.position,
        media_path             = excluded.media_path,
        original_media_path    = excluded.original_media_path,
        audio_path             = excluded.audio_path,
        audio_start_seconds    = excluded.audio_start_seconds,
        audio_duration_seconds = excluded.audio_duration_seconds,
        allow_audio_replay     = excluded.allow_audio_replay,
        image_file_name        = excluded.image_file_name,
        audio_file_name        = excluded.audio_file_name
      where public.questions.round_id in (select id from public.rounds where quiz_id = p_quiz_id);

      if not found then
        raise exception 'QUESTION_ID_CONFLICT' using errcode = 'P0001';
      end if;

      v_question_ids := v_question_ids || v_question_id;

      select coalesce(array_agg((value ->> 'id')::uuid), '{}')
        into v_choice_ids
        from jsonb_array_elements(coalesce(q -> 'choices', '[]'::jsonb));

      delete from public.choices
       where question_id = v_question_id
         and not (id = any (v_choice_ids));

      c_pos := 0;
      for c in select value from jsonb_array_elements(coalesce(q -> 'choices', '[]'::jsonb)) loop
        insert into public.choices (id, question_id, label, text, position)
        values ((c ->> 'id')::uuid, v_question_id, c ->> 'label', btrim(c ->> 'text'), c_pos)
        on conflict (id) do update
          set label = excluded.label, text = excluded.text, position = excluded.position
          where public.choices.question_id = v_question_id;

        if not found then
          raise exception 'CHOICE_ID_CONFLICT' using errcode = 'P0001';
        end if;
        c_pos := c_pos + 1;
      end loop;

      update public.questions
         set correct_choice_id = (
               select id from public.choices
                where question_id = v_question_id and label = q ->> 'correct_label'
             )
       where id = v_question_id;

      q_pos := q_pos + 1;
    end loop;

    r_pos := r_pos + 1;
  end loop;

  delete from public.questions
   where round_id in (select id from public.rounds where quiz_id = p_quiz_id)
     and not (id = any (v_question_ids));

  delete from public.rounds
   where quiz_id = p_quiz_id
     and not (id = any (v_round_ids));

  update public.quizzes set updated_at = now() where id = p_quiz_id;
end;
$$;

-- Write recomputed standings for many players in one round trip.
create or replace function public.apply_player_standings(p_session_id uuid, p_rows jsonb)
returns void
language sql
set search_path = public
as $$
  update public.players p
     set score                       = s.score,
         streak                      = s.streak,
         best_streak                 = s.best_streak,
         correct_answer_count        = s.correct_answer_count,
         total_correct_response_time = s.total_correct_response_time,
         last_points                 = s.last_points
    from jsonb_to_recordset(p_rows) as s(
           id uuid, score integer, streak integer, best_streak integer,
           correct_answer_count integer, total_correct_response_time bigint, last_points integer)
   where p.id = s.id
     and p.game_session_id = p_session_id;
$$;

revoke execute on function public.save_quiz_content(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_player_standings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_quiz_content(uuid, jsonb) to service_role;
grant execute on function public.apply_player_standings(uuid, jsonb) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Row-level security
-- ───────────────────────────────────────────────────────────────────────────
alter table public.quizzes           enable row level security;
alter table public.rounds            enable row level security;
alter table public.questions         enable row level security;
alter table public.choices           enable row level security;
alter table public.game_sessions     enable row level security;
alter table public.players           enable row level security;
alter table public.player_answers    enable row level security;
alter table public.question_progress enable row level security;

-- Browser roles get nothing by default…
revoke all on public.quizzes, public.rounds, public.questions, public.choices,
              public.game_sessions, public.players, public.player_answers,
              public.question_progress
  from anon, authenticated;

-- …except read access to what realtime subscriptions need.
grant select on public.game_sessions to anon, authenticated;
grant select on public.question_progress to anon, authenticated;
grant select (
  id, game_session_id, nickname, score, streak, best_streak, correct_answer_count,
  total_correct_response_time, last_points, connected, kicked, joined_at, last_seen_at
) on public.players to anon, authenticated;

create policy "Game state is readable for realtime"
  on public.game_sessions for select to anon, authenticated using (true);

create policy "Lobby and leaderboard entries are readable for realtime"
  on public.players for select to anon, authenticated using (true);

create policy "Answer counts are readable for realtime"
  on public.question_progress for select to anon, authenticated using (true);

-- No policies on quizzes, rounds, questions, choices or player_answers:
-- with RLS enabled and no policy, anon/authenticated can never read correct
-- answers, other players' answers, or unpublished quizzes.

-- ───────────────────────────────────────────────────────────────────────────
-- Realtime
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.game_sessions, public.players, public.question_progress;
  end if;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Storage: private bucket, restricted MIME types, 15 MB per file.
-- Uploads use short-lived signed upload URLs created by the server; reads use
-- signed URLs. No storage.objects policies are granted to browser roles.
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'quiz-media', 'quiz-media', false, 15728640,
      array['image/png', 'image/jpeg', 'image/webp',
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/ogg']
    )
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;
