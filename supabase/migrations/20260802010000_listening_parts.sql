-- Listening Part 1-4 model (audit 2026-08-01, content fix #1).
-- Real IELTS Listening is four fixed parts:
--   Part 1: conversation between two people in an everyday/transactional context
--   Part 2: monologue in an everyday social context
--   Part 3: conversation (2-4 people) in an education/training context
--   Part 4: monologue on an academic subject (lecture)
-- Backfill classifies every published listening passage by speaker count and
-- register; new content must set the part explicitly.

alter table public.listening_details
  add column if not exists part smallint
  constraint listening_details_part_check check (part between 1 and 4);

comment on column public.listening_details.part is
  'IELTS Listening part (1-4). 1=everyday dialogue, 2=everyday monologue, 3=academic discussion, 4=lecture.';

with mapping(slug, part) as (
  values
    -- Part 1: two-speaker everyday transactional dialogues
    ('applying-for-a-part-time-cafe-job-2bwb01', 1),
    ('arranging-a-furniture-delivery-s9w9vi', 1),
    ('booking-a-holiday-cottage-in-the-lake-district-6e4e48', 1),
    ('booking-an-airport-taxi-1uyovg', 1),
    ('enrolling-in-an-evening-cookery-course-33uax3', 1),
    ('joining-the-citywheels-car-share-scheme-1jj1fj', 1),
    ('kingsbridge-library-membership-registration-olhdnl', 1),
    ('lost-property-enquiry-at-central-station-a18xg8', 1),
    ('placing-a-party-catering-order-1rlymd', 1),
    ('registering-at-fernbank-dental-practice-o7y6cy', 1),
    ('reporting-a-broadband-fault-fbfyjw', 1),
    ('reporting-a-leak-to-a-plumbing-company-1qzdaj', 1),
    ('riverside-sports-centre-membership-enquiry-7w50d2', 1),
    -- Part 2: single-speaker everyday/social monologues
    ('a-walking-tour-of-ashcombe-old-town-14toca', 2),
    ('announcements-at-the-summer-food-festival-xibrtt', 2),
    ('community-garden-open-day-welcome-th5glc', 2),
    ('induction-talk-for-new-food-bank-volunteers-1aoizp', 2),
    ('launch-of-the-harborough-cycle-hire-scheme-5q887s', 2),
    ('orientation-tour-of-the-city-museum-1pprzq', 2),
    ('the-renovation-of-the-old-gaumont-theatre-k9sos9', 2),
    ('tour-of-the-new-leisure-centre-1gr7dc', 2),
    ('welcome-talk-at-riverside-country-park-dvo1dy', 2),
    ('welcome-talk-for-new-running-club-members-18vc57', 2),
    -- Part 3: multi-speaker academic/training discussions
    ('design-review-a-student-footbridge-project-1yp92j', 3),
    ('fieldwork-debrief-observing-children-at-play-1av2w3', 3),
    ('project-feedback-a-river-restoration-study-d5vrkb', 3),
    ('research-proposal-a-primary-school-reading-scheme-1ty6d1', 3),
    ('seminar-prep-sources-on-the-industrial-revolution-cckjgx', 3),
    ('seminar-a-business-case-study-on-brightleaf-tea-1s3g7t', 3),
    ('tutorial-designing-a-loyalty-card-consumer-survey-l1p49b', 3),
    ('tutorial-planning-a-cycling-to-campus-study-1oxavs', 3),
    ('tutorial-planning-a-geography-field-trip-mzr406', 3),
    ('tutorial-planning-a-student-diet-survey-1um8p4', 3),
    ('tutorial-reviewing-an-enzyme-experiment-s-results-xv22sl', 3),
    -- Part 4: single-speaker academic lectures
    ('lecture-a-history-of-timekeeping-1huinu', 4),
    ('lecture-bamboo-as-a-building-material-1epbxp', 4),
    ('lecture-gutenberg-and-the-printing-revolution-1rkbnt', 4),
    ('lecture-nudges-and-behavioural-economics-rwnu2q', 4),
    ('lecture-seagrass-meadows-and-the-ocean-1d7ofo', 4),
    ('lecture-the-garden-city-movement-19zu1i', 4),
    ('lecture-the-loss-of-the-world-s-languages-5o7bua', 4),
    ('lecture-the-psychology-of-habit-formation-apxrhd', 4),
    ('lecture-the-rise-of-urban-beekeeping-9rzv4x', 4),
    ('lecture-underwater-archaeology-and-shipwrecks-v1p4vi', 4),
    ('lecture-wildlife-corridors-in-cities-1i34pk', 4)
)
update public.listening_details ld
set part = mapping.part
from mapping
join public.passages p on p.slug = mapping.slug
where ld.passage_id = p.id;
