-- Sample published quiz so a full game can be played before any media is uploaded.
-- Media question types (silhouette, audio, blurred image, scene) are best created in
-- the admin editor or via Excel import, where images and audio can be attached.

do $$
declare
  v_quiz  uuid := '00000000-0000-4000-8000-000000000001';
  v_r1    uuid := '00000000-0000-4000-8000-000000000101';
  v_r2    uuid := '00000000-0000-4000-8000-000000000102';
begin
  if exists (select 1 from public.quizzes where id = v_quiz) then
    return;
  end if;

  insert into public.quizzes (id, title, subtitle, description, status)
  values (v_quiz, 'Sakura & Spirits Warm-up', 'Sample quiz',
          'A short text-only quiz to test the live game flow end to end.', 'draft');

  perform public.save_quiz_content(v_quiz, jsonb_build_object(
    'title', 'Sakura & Spirits Warm-up',
    'subtitle', 'Sample quiz',
    'description', 'A short text-only quiz to test the live game flow end to end.',
    'rounds', jsonb_build_array(
      jsonb_build_object('id', v_r1, 'title', 'Round 1: Festival Warm-up', 'multiplier', 1, 'questions', jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001001', 'type', 'EMOJI',
          'prompt', '🍥🦊🍜🥷', 'correct_label', 'B', 'time_limit_seconds', 20, 'multiplier', 1,
          'explanation', 'Narutomaki, a nine-tailed fox, ramen and ninjas.',
          'choices', jsonb_build_array(
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010011', 'label', 'A', 'text', 'Bleach'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010012', 'label', 'B', 'text', 'Naruto'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010013', 'label', 'C', 'text', 'One Piece'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010014', 'label', 'D', 'text', 'Fairy Tail'))),
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001002', 'type', 'QUOTE',
          'prompt', '"I''m gonna be King of the Pirates!"', 'correct_label', 'C', 'time_limit_seconds', 20, 'multiplier', 1,
          'explanation', 'Monkey D. Luffy''s signature declaration.',
          'choices', jsonb_build_array(
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010021', 'label', 'A', 'text', 'Zoro'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010022', 'label', 'B', 'text', 'Ace'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010023', 'label', 'C', 'text', 'Luffy'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010024', 'label', 'D', 'text', 'Shanks'))),
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001003', 'type', 'TRIVIA',
          'prompt', 'Which studio animated "Spirited Away"?', 'correct_label', 'A', 'time_limit_seconds', 20, 'multiplier', 1,
          'explanation', 'Studio Ghibli released Spirited Away in 2001.',
          'choices', jsonb_build_array(
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010031', 'label', 'A', 'text', 'Studio Ghibli'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010032', 'label', 'B', 'text', 'Kyoto Animation'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010033', 'label', 'C', 'text', 'MAPPA'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010034', 'label', 'D', 'text', 'Madhouse'))))),
      jsonb_build_object('id', v_r2, 'title', 'Round 2: Double Spirits', 'multiplier', 2, 'questions', jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001004', 'type', 'EMOJI',
          'prompt', '📓🍎💀✍️', 'correct_label', 'D', 'time_limit_seconds', 20, 'multiplier', 2,
          'explanation', 'A notebook, an apple-loving shinigami, and a lot of writing.',
          'choices', jsonb_build_array(
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010041', 'label', 'A', 'text', 'Soul Eater'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010042', 'label', 'B', 'text', 'Bungo Stray Dogs'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010043', 'label', 'C', 'text', 'Jujutsu Kaisen'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010044', 'label', 'D', 'text', 'Death Note'))),
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001005', 'type', 'TRIVIA',
          'prompt', 'In "My Neighbor Totoro", what does Totoro use as an umbrella in the rain?', 'correct_label', 'B',
          'time_limit_seconds', 25, 'multiplier', 2,
          'explanation', 'Satsuki lends Totoro her father''s umbrella at the bus stop.',
          'choices', jsonb_build_array(
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010051', 'label', 'A', 'text', 'A lotus leaf'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010052', 'label', 'B', 'text', 'A black umbrella'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010053', 'label', 'C', 'text', 'A straw hat'),
            jsonb_build_object('id', '00000000-0000-4000-8000-000000010054', 'label', 'D', 'text', 'Nothing at all')))))
    )
  ));

  update public.quizzes set status = 'published' where id = v_quiz;
end;
$$;
