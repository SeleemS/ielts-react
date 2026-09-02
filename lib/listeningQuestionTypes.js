// lib/listeningQuestionTypes.js
// Single source of truth for the IELTS Listening part hub pages
// (pages/listening/[type].js), mirroring lib/readingQuestionTypes.js.
//
// Each entry maps a URL slug -> the listening_details.part value (see
// supabase/migrations/20260802010000_listening_parts.sql) plus SEO metadata and
// a genuinely-useful, UNIQUE strategy guide (this prose is the SEO payload).
//
// Guide shape (identical to the reading hubs):
//   { answer, intro, tests, steps: [], traps: [], timing }
// rendered by the hub page into an <h1>, a strategy article and lists.

import { SITE_URL } from './site';

export const LISTENING_PARTS = {
  'part-1': {
    slug: 'part-1',
    part: 1,
    label: 'Part 1',
    h1: 'IELTS Listening Part 1 Practice',
    title: 'IELTS Listening Part 1 Practice: Everyday Conversations | IELTS-Bank',
    description:
      'Free IELTS Listening Part 1 practice. Everyday two-person conversations with form and note completion — master spellings, numbers and the classic correction trap.',
    guide: {
      answer:
        'Part 1 is a conversation between two people in an everyday situation — booking a taxi, joining a gym, arranging a delivery. You answer 10 questions, almost always form, note or table completion, by catching specific details: names, spellings, phone numbers, dates, prices and addresses.',
      intro:
        'Part 1 opens the Listening test with its most transactional recording: two speakers exchanging practical information. One person usually wants something (a booking, a membership, a repair) and the other collects or provides details. Because the answers are concrete facts rather than ideas, Part 1 is where strong candidates aim for 9 or 10 out of 10 — but it punishes lapses in concentration, since a single misheard digit or letter costs the mark.',
      tests:
        'Part 1 tests your ability to catch specific factual details at conversational speed: proper names spelled letter by letter, telephone numbers, dates and times, quantities and prices, postcodes and addresses. The dominant question format is completing a form or set of notes with a strict word/number limit, so accurate transcription matters as much as comprehension.',
      steps: [
        'Use the preparation time to read every gap and predict what each answer will be: a name, a number, a day of the week, an amount of money.',
        'Note the word limit on the instructions — writing "the 14th of June" where "ONE WORD AND/OR A NUMBER" is allowed throws away a mark you actually heard.',
        'Track the conversation with the questions, which follow the recording in order; if you miss one, let it go immediately and lock onto the next gap.',
        'When a speaker spells a name, write the letters as you hear them — do not try to guess the word first and check the spelling after.',
        'In the checking time, confirm every answer fits the gap grammatically and respects the limit, and that plurals and units are right.',
      ],
      traps: [
        'The correction trap: a speaker gives a detail, then changes it ("let’s say Tuesday — actually, Wednesday is better"). The corrected version is the answer, and Part 1 does this constantly.',
        'Confusable numbers: 13/30, 15/50, and letter pairs like A/E, G/J, and double letters in spellings ("double t").',
        'Writing the first plausible detail you hear when the question asks for something more specific — the recording often mentions several prices or times before the one that answers the question.',
        'Losing a mark on spelling: misspelled answers are wrong, even when you clearly heard the word.',
      ],
      timing:
        'The recording plays once and lasts around four to five minutes, with short pauses to read ahead. Use every pause to preview the next questions rather than perfecting the last answer — on computer you get two minutes at the end to check, and on paper ten minutes to transfer, which is when tidying happens.',
    },
  },

  'part-2': {
    slug: 'part-2',
    part: 2,
    label: 'Part 2',
    h1: 'IELTS Listening Part 2 Practice',
    title: 'IELTS Listening Part 2 Practice: Everyday Monologues | IELTS-Bank',
    description:
      'Free IELTS Listening Part 2 practice. Single-speaker talks, tours and announcements — handle maps, multiple choice and matching without losing your place.',
    guide: {
      answer:
        'Part 2 is a monologue in an everyday social context — a guided tour, a welcome talk, an announcement about local facilities. You answer 10 questions, commonly multiple choice, matching, and map or plan labelling, by following one speaker’s organised description.',
      intro:
        'Part 2 swaps the two-way exchange of Part 1 for a single voice: someone introducing a museum, explaining changes to a leisure centre, or orienting new volunteers. With no second speaker to break the flow, the information arrives in longer, more structured stretches, and the question types broaden beyond simple gap-fill. It is also the home of the map task, which rewards a very specific skill — converting spoken directions into positions on a plan.',
      tests:
        'Part 2 tests sustained attention to one speaker and the ability to follow the organisation of a talk: what is where, what has changed, what happens when. Expect multiple choice, matching (for example, matching facilities to locations or events to days) and plan/map labelling, alongside occasional note completion. Paraphrase matters more than in Part 1 — options rephrase the recording rather than repeating it.',
      steps: [
        'In the preparation pause, read the questions and mark the key difference between multiple-choice options, so you listen for meaning rather than matching words.',
        'For a map task, orient yourself before the audio starts: find the entrance or starting point, the compass if there is one, and every label already printed.',
        'Follow the speaker’s signposts ("first", "as you come in", "moving on to") — the questions follow the order of the talk.',
        'For matching questions, keep the option list in view and cross off used options only if the instructions say each is used once.',
        'When an answer window passes without you catching it, choose the most likely option and move on — dwelling costs you the next two answers.',
      ],
      traps: [
        'Map disorientation: "on your left" is the speaker’s left along the route being described, not the left of the page.',
        'Multiple-choice distractors that quote the recording word-for-word while the correct answer is a paraphrase.',
        'Mentions of every option: in matching and multiple choice, the speaker usually touches all the options — the answer is the one that fits the question, not the one you heard most recently.',
        'Assuming old information still applies: Part 2 talks love describing what used to be the case before announcing the change that is the actual answer.',
      ],
      timing:
        'One hearing, roughly four to five minutes of audio, ten questions. The reading pauses are shorter relative to the question load than Part 1, so triage: study map and matching layouts first (they take longest to absorb) and trust that multiple-choice stems can be re-skimmed in a second or two.',
    },
  },

  'part-3': {
    slug: 'part-3',
    part: 3,
    label: 'Part 3',
    h1: 'IELTS Listening Part 3 Practice',
    title: 'IELTS Listening Part 3 Practice: Academic Discussions | IELTS-Bank',
    description:
      'Free IELTS Listening Part 3 practice. Tutorial and seminar discussions between students and tutors — track opinions, agreement and multi-speaker exchanges.',
    guide: {
      answer:
        'Part 3 is a conversation between two to four people in an academic setting — typically students discussing an assignment with each other or a tutor. You answer 10 questions, usually multiple choice and matching, by tracking who says what, who agrees, and what they decide.',
      intro:
        'Part 3 is where the Listening test turns academic and, for most candidates, where scores dip. The recording is a discussion — planning a survey, reviewing an experiment, getting feedback on a project — and the questions stop asking for simple facts. Instead they probe opinions, reasons, agreements and decisions, spread across multiple voices. The challenge is attribution: not just what was said, but who said it and whether anyone else agreed.',
      tests:
        'Part 3 tests comprehension of interactive academic speech: distinguishing speakers, following an evolving discussion, recognising stated and implied opinions, and catching the difference between a suggestion, a decision and a rejected idea. Multiple choice and matching dominate, with occasional flow-chart or note completion about the project under discussion. The paraphrase gap between recording and options is at its widest here.',
      steps: [
        'Before the audio, read the questions and note whose view each one asks about — "What does Marta think…" is answered by Marta’s words, not her tutor’s.',
        'Learn the voices in the first few seconds: names are always exchanged early, and attaching name to voice immediately pays off for the whole part.',
        'Listen for opinion and agreement language ("I’d go further", "I’m not convinced", "that’s exactly it") — these phrases mark where answers live.',
        'Track decisions to the end of each exchange: speakers float several ideas before settling, and the question wants what they finally agree, not what they first propose.',
        'Answer on meaning, not word-match — the correct option nearly always rephrases the recording, while wrong options recycle its vocabulary.',
      ],
      traps: [
        'Attributing one speaker’s opinion to another, especially when a speaker summarises someone else’s view before disagreeing with it.',
        'Taking a rejected suggestion as the answer because it was discussed at length — length of discussion does not equal decision.',
        'Distractors built from literal wording: hearing the exact words of option A is often evidence that A is wrong.',
        'Losing an answer while still deliberating over the previous question — Part 3 exchanges move quickly and answer windows are short.',
      ],
      timing:
        'One hearing, about five minutes, ten questions, no mercy for hesitation. Use the mid-part pause to read the second half of the questions properly. If two options still seem possible when the discussion moves on, commit to one instantly — an unanswered question is the only guaranteed lost mark.',
    },
  },

  'part-4': {
    slug: 'part-4',
    part: 4,
    label: 'Part 4',
    h1: 'IELTS Listening Part 4 Practice',
    title: 'IELTS Listening Part 4 Practice: Academic Lectures | IELTS-Bank',
    description:
      'Free IELTS Listening Part 4 practice. Single-speaker academic lectures with note completion — follow the structure, survive the no-pause format and keep pace.',
    guide: {
      answer:
        'Part 4 is a university-style lecture: one speaker, an academic subject, 10 questions — almost always note completion with a one-word limit — and, uniquely, no break in the middle. You succeed by using the printed notes as a map of the lecture and never losing your place.',
      intro:
        'Part 4 closes the Listening test with its most demanding format: a five-minute monologue on an academic topic — urban beekeeping, the history of timekeeping, language loss — delivered without the mid-part pause every other section gets. The questions are usually a single set of structured notes summarising the whole lecture. The compensation for the harder format is predictability: the notes reveal the lecture’s entire skeleton before a word is spoken, and answers are nearly always single nouns you hear explicitly.',
      tests:
        'Part 4 tests sustained listening to formal, information-dense speech: following a lecture’s structure through its signpost language, holding concentration for five unbroken minutes, and extracting precise content words. Although the topic is academic, the answers are concrete — materials, causes, examples, quantities — and no subject knowledge is ever required or rewarded.',
      steps: [
        'Spend the whole preparation time on the notes: the headings tell you the lecture’s sections, and each gap’s surrounding words tell you the grammar and meaning of its answer.',
        'Predict the word class for every gap — noun, adjective, number — and any obvious semantic field (a material, an animal, a place).',
        'Use the printed words around the gaps as landmarks; when you hear a paraphrase of a landmark, its gap is seconds away.',
        'Follow lecture signposts ("turning now to", "a second factor", "to illustrate this") to track which section of the notes the speaker has reached.',
        'If a gap flies past, abandon it without hesitation and re-anchor on the next printed landmark — losing one answer is recoverable, losing your place is not.',
      ],
      traps: [
        'Losing your position mid-lecture and missing a run of answers — the single biggest cause of Part 4 disasters.',
        'Writing a word the speaker said that does not fit the gap grammatically; the completed note must read correctly.',
        'Being thrown by the academic topic: candidates who stop to think about content miss the next answer. The lecture explains everything you need.',
        'Spelling errors on answers you heard perfectly — Part 4 answers skew toward less common nouns, so transcribe with care.',
      ],
      timing:
        'One hearing, no mid-part pause, around five minutes for all ten answers. Front-load your effort into the preparation window and stay strictly with the speaker’s pace. Save any half-caught spellings for the end-of-test checking time rather than fixing them live.',
    },
  },
};

// Question-phrased FAQs per part, rendered as an FAQ section (H3s under a
// question H2) plus FAQPage JSON-LD. Same shape as SPEAKING_PARTS[..].guide.faqs
// so the two hub families stay consistent.
export const LISTENING_PART_FAQS = {
  'part-1': [
    {
      q: 'How many questions are in IELTS Listening Part 1?',
      a: 'Ten, out of 40 in the whole test. They almost always come as one form, note or table completion task following a two-person conversation.',
    },
    {
      q: 'Do spelling mistakes lose marks in Listening Part 1?',
      a: 'Yes. A misspelled answer is marked wrong even if you clearly heard the word, which is why names are spelled out letter by letter in the recording.',
    },
    {
      q: 'Is Part 1 the easiest part of the Listening test?',
      a: 'It is the most predictable — concrete facts, one hearing, questions in order — so strong candidates target 9 or 10 out of 10 here and treat any loss as avoidable.',
    },
  ],
  'part-2': [
    {
      q: 'What is IELTS Listening Part 2 about?',
      a: 'A single speaker in an everyday social context: a guided tour, a welcome talk, or an announcement about local facilities, followed by ten questions.',
    },
    {
      q: 'How do you answer a map or plan labelling question?',
      a: 'Orient yourself before the audio starts — find the entrance, the compass and every printed label — then follow the speaker route, remembering that "on your left" means the speaker left, not the page left.',
    },
    {
      q: 'Why are multiple-choice options in Part 2 so confusing?',
      a: 'The speaker usually mentions every option. The correct one is normally a paraphrase of what you hear, while the distractors repeat the recording word for word.',
    },
  ],
  'part-3': [
    {
      q: 'How many speakers are there in IELTS Listening Part 3?',
      a: 'Usually two to four — commonly two students, or students with a tutor, discussing an assignment, an experiment or a project.',
    },
    {
      q: 'Why is Part 3 harder than Parts 1 and 2?',
      a: 'The questions ask about opinions, agreement and decisions rather than facts, so you must track who said what while the discussion keeps moving.',
    },
    {
      q: 'How do you avoid confusing the speakers?',
      a: 'Learn the voices in the first few seconds — names are always exchanged early — and note beside each question whose view it asks about before the audio starts.',
    },
  ],
  'part-4': [
    {
      q: 'Is there a break in the middle of Listening Part 4?',
      a: 'No. Part 4 is the only part with no mid-part pause, which is why keeping your place in the printed notes matters more than any single answer.',
    },
    {
      q: 'What kind of answers does Part 4 need?',
      a: 'Almost always single content words you hear explicitly — materials, causes, examples, quantities — written into a set of structured lecture notes with a strict word limit.',
    },
    {
      q: 'Do you need background knowledge for the Part 4 lecture?',
      a: 'Never. The topic is academic but the lecture explains everything required, and candidates who stop to think about the subject matter miss the next answer.',
    },
  ],
};

// Ordered list of slugs for getStaticPaths and cross-link blocks.
export const LISTENING_PART_SLUGS = Object.keys(LISTENING_PARTS);

export function getListeningPartSeo(typeKey) {
  const config = LISTENING_PARTS[typeKey];
  if (!config) return null;

  const canonical = `${SITE_URL}/listening/${typeKey}`;
  return {
    title: config.title,
    description: config.description,
    canonical,
    ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
      config.h1
    )}&type=listening&subtitle=${encodeURIComponent(config.label)}`,
    imageAlt: `${config.h1} — IELTS-Bank`,
  };
}

// Lightweight [{ slug, label }] list for navigation / cross-link UI.
export const LISTENING_PART_LINKS = LISTENING_PART_SLUGS.map((slug) => ({
  slug,
  label: LISTENING_PARTS[slug].label,
}));
