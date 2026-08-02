-- Backfill instructions_html where neither prompt nor instructions carries any
-- guidance, and re-type four mislabeled sentence-endings groups (audit
-- 2026-08-01, content fix #10). Instructions are generated from each group's
-- real option keys / word limits so they cannot drift from the data. Groups
-- whose prompt already contains the guidance are left alone to avoid rendering
-- the same instruction twice.

-- 0) Four multiple_choice groups are really matching sentence endings
--    ("Complete each sentence with the correct ending, A-K"). Same
--    optionKeySingle grading; input becomes the correct select.
update public.question_groups
set question_type = 'matching_sentence_endings'
where question_type = 'multiple_choice'
  and prompt ~* 'correct ending';

-- 1) multiple_choice with no guidance anywhere: "Choose the correct letter,
--    A, B, C or D." built from the group's actual option keys.
with letters as (
  select question_group_id, array_agg(option_key order by position) as keys
  from public.group_options
  group by 1
)
update public.question_groups qg
set instructions_html =
  '<p>Choose the correct letter, <strong>'
  || array_to_string(l.keys[1:cardinality(l.keys) - 1], '</strong>, <strong>')
  || '</strong> or <strong>' || l.keys[cardinality(l.keys)] || '</strong>.</p>'
from letters l
join public.question_groups g on g.id = l.question_group_id
join public.passages p on p.id = g.passage_id
where qg.id = l.question_group_id
  and p.status = 'published'
  and qg.question_type = 'multiple_choice'
  and coalesce(qg.instructions_html, '') = ''
  and coalesce(qg.prompt, '') !~* 'choose|select|correct letter'
  and cardinality(l.keys) >= 2;

-- 2) short_answer / sentence_completion with no guidance anywhere: word-limit
--    phrase derived from the group's answer keys (max word_limit + whether any
--    accepted answer contains a digit).
with limits as (
  select q.question_group_id,
         max(coalesce(ak.word_limit, 3)) as wl,
         bool_or(ak.accepted::text ~ '[0-9]') as has_digit
  from public.questions q
  join public.answer_keys ak on ak.question_id = q.id
  group by 1
)
update public.question_groups qg
set instructions_html =
  '<p>' || case qg.question_type
             when 'short_answer' then 'Answer the questions below. Write <strong>'
             else 'Complete the sentences below. Write <strong>'
           end
  || case
       when li.wl = 1 and li.has_digit then 'ONE WORD AND/OR A NUMBER'
       when li.wl = 1 then 'ONE WORD ONLY'
       when li.wl = 2 and li.has_digit then 'NO MORE THAN TWO WORDS AND/OR A NUMBER'
       when li.wl = 2 then 'NO MORE THAN TWO WORDS'
       when li.has_digit then 'NO MORE THAN THREE WORDS AND/OR A NUMBER'
       else 'NO MORE THAN THREE WORDS'
     end
  || '</strong> for each answer.</p>'
from limits li
join public.question_groups g on g.id = li.question_group_id
join public.passages p on p.id = g.passage_id
where qg.id = li.question_group_id
  and p.status = 'published'
  and qg.question_type in ('short_answer', 'sentence_completion')
  and coalesce(qg.instructions_html, '') = ''
  and coalesce(qg.prompt, '') !~* 'write|choose|complete';

-- 3) matching_sentence_endings with no guidance anywhere: letter range from
--    the group's options.
with letters as (
  select question_group_id, max(option_key) as last_key
  from public.group_options
  group by 1
)
update public.question_groups qg
set instructions_html =
  '<p>Complete each sentence with the correct ending, <strong>A&ndash;'
  || l.last_key || '</strong>, below.</p>'
from letters l
join public.question_groups g on g.id = l.question_group_id
join public.passages p on p.id = g.passage_id
where qg.id = l.question_group_id
  and p.status = 'published'
  and qg.question_type = 'matching_sentence_endings'
  and coalesce(qg.instructions_html, '') = ''
  and coalesce(qg.prompt, '') !~* 'ending|choose|complete';
