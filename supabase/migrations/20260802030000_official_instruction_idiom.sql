-- Standardize instruction wording to official IELTS idiom (audit 2026-08-01,
-- content fix #7).
--
-- 1) Official papers write "NO MORE THAN TWO WORDS AND/OR A NUMBER" /
--    "ONE WORD AND/OR A NUMBER"; 19 groups used the non-official
--    "... OR A NUMBER" variant. The pattern cannot touch the correct idiom:
--    "AND/OR" never matches "WORDS? OR A NUMBER" with a single space.
update public.question_groups
set instructions_html =
  regexp_replace(instructions_html, '(WORDS?) OR A NUMBER', '\1 AND/OR A NUMBER', 'g')
where instructions_html ~ 'WORDS? OR A NUMBER';

-- 2) Three published TFNG/YNNG groups gave no TRUE/FALSE/NOT GIVEN (or
--    YES/NO/NOT GIVEN) guidance in either prompt or instructions. Backfill the
--    canonical instruction block; prompts are left as short lead-ins.
update public.question_groups qg
set instructions_html =
  '<p>Do the following statements agree with the information given in the text? Write <strong>TRUE</strong> if the statement agrees with the information, <strong>FALSE</strong> if the statement contradicts the information, or <strong>NOT GIVEN</strong> if there is no information on this.</p>'
from public.passages p
where p.id = qg.passage_id
  and p.status = 'published'
  and qg.question_type = 'true_false_notgiven'
  and coalesce(qg.instructions_html, '') !~* 'TRUE'
  and qg.prompt !~* 'Write TRUE|write <strong>TRUE';

update public.question_groups qg
set instructions_html =
  '<p>Do the following statements agree with the views of the writer? Write <strong>YES</strong> if the statement agrees with the views of the writer, <strong>NO</strong> if the statement contradicts the views of the writer, or <strong>NOT GIVEN</strong> if it is impossible to say what the writer thinks about this.</p>'
from public.passages p
where p.id = qg.passage_id
  and p.status = 'published'
  and qg.question_type = 'yes_no_notgiven'
  and coalesce(qg.instructions_html, '') !~* 'YES'
  and qg.prompt !~* 'Write YES|write <strong>YES';
