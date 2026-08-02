-- Re-type the five listening map-labelling groups from matching_information
-- to the official plan_map_diagram_label type (audit 2026-08-01, content fix
-- #4). These groups already have the authentic shape - an SVG plan plus
-- lettered location options - so only the enum value changes; grading stays
-- correct_option_keys via the select/optionKeySingle config in grade.js.

update public.question_groups qg
set question_type = 'plan_map_diagram_label'
from public.passages p
where p.id = qg.passage_id
  and p.skill = 'listening'
  and qg.question_type = 'matching_information'
  and qg.image_svg is not null;
