// lib/speakingParts.js
// Single source of truth for the IELTS Speaking PART hub pages
// (pages/speaking/[part].js), mirroring lib/listeningQuestionTypes.js and
// lib/readingQuestionTypes.js.
//
// Guide shape (identical to the reading/listening hubs, so the page markup and
// the SEO contract stay consistent across the site):
//   { answer, intro, tests, listeningFor: [], steps: [], traps: [], timing }
// `answer` is the above-the-fold "Quick answer" capsule — the single strongest
// trait shared by pages that AI assistants cite.

import { SITE_URL } from './site';

export const SPEAKING_PARTS = {
  'part-1': {
    slug: 'part-1',
    part: 1,
    label: 'Part 1',
    h1: 'IELTS Speaking Part 1: Introduction and Interview',
    title: 'IELTS Speaking Part 1: Questions, Timing & Answers | IELTS-Bank',
    description:
      'What IELTS Speaking Part 1 is, how long it lasts and what the examiner listens for, with free practice questions by topic and answer-length guidance.',
    timingLine: '4–5 minutes, about 12 questions on familiar topics',
    guide: {
      answer:
        'Part 1 is a 4–5 minute interview that opens the test. After checking your identity, the examiner asks about 12 short questions on familiar topics — your home, work or studies, and two or three everyday subjects. Answer each question in two or three sentences: a direct answer, then a reason or example. One-word answers and memorised speeches both lose marks.',
      intro:
        'Part 1 exists to settle you down and to give the examiner a first sample of your natural, unrehearsed English. The topics are deliberately ordinary — where you live, whether you work or study, then two or three familiar areas such as food, weather, technology or free time. Nothing here is designed to catch you out, which is exactly why it is dangerous: candidates either answer in three words or launch into a rehearsed monologue, and both patterns are obvious from the first exchange.',
      tests:
        'Part 1 tests whether you can produce fluent, natural speech on everyday subjects without preparation. The examiner is sampling your ability to answer directly, extend an answer by one step, and use ordinary vocabulary and tenses accurately. Because the questions cover habits, preferences, past experience and future intentions, they also sample your control of the present simple, past simple and future forms within a couple of minutes.',
      listeningFor: [
        'Answers that are extended, not padded — roughly two or three sentences per question.',
        'Natural hesitation and self-correction rather than memorised, over-polished chunks.',
        'Everyday vocabulary used precisely, with the odd less common word used correctly.',
        'Accurate simple tenses, especially when questions switch between habits, the past and plans.',
      ],
      steps: [
        'Answer the actual question in your first sentence — do not open with a preamble.',
        'Add one reason, example or contrast, then stop and let the examiner ask the next question.',
        'Use the tense the question uses: "Did you…" needs a past answer, "Do you usually…" needs a habit.',
        'When you have no strong opinion, say so honestly and explain why — that is a valid, gradable answer.',
        'Keep the register conversational: contractions, discourse markers, a normal speaking pace.',
      ],
      traps: [
        'One-word answers ("Yes, I do."), which give the examiner nothing to grade.',
        'Memorised answers, which are easy to spot and are explicitly penalised for lack of natural fluency.',
        'Over-long answers: Part 1 is not the long turn, and the examiner will interrupt you.',
        'Asking the examiner questions or trying to start a conversation — they will not respond in kind.',
        'Repeating the question wording back word for word instead of paraphrasing it.',
      ],
      timing:
        'Part 1 lasts 4 to 5 minutes in total, so each answer is only about 20 seconds. Two or three sentences fills that comfortably. If you routinely run past 30 seconds you will be cut off, which breaks your rhythm going into Part 2.',
      faqs: [
        {
          q: 'How long should a Part 1 answer be?',
          a: 'Two or three sentences, roughly 20 seconds: a direct answer plus one reason or example. Shorter gives the examiner nothing to grade; longer risks being interrupted.',
        },
        {
          q: 'Can you say "I don\'t know" in Part 1?',
          a: 'Yes, as long as you follow it with something. "I have never really thought about it, but I suppose…" is natural English and is graded normally; a bare "I don\'t know" is not.',
        },
        {
          q: 'Does Part 1 count towards your band score?',
          a: 'Yes. One band per criterion is awarded for the whole 11–14 minute test, and everything you say in Part 1 counts towards it.',
        },
      ],
    },
  },

  'part-2': {
    slug: 'part-2',
    part: 2,
    label: 'Part 2',
    h1: 'IELTS Speaking Part 2: The Cue Card Long Turn',
    title: 'IELTS Speaking Part 2 Cue Cards: Timing & Structure | IELTS-Bank',
    description:
      'How IELTS Speaking Part 2 works: one minute to prepare, one to two minutes to speak. Structure for the long turn, plus free cue cards with examiner audio.',
    timingLine: '1 minute preparation, 1–2 minutes speaking',
    guide: {
      answer:
        'Part 2 is the long turn: the examiner gives you a cue card with a topic and three or four bullet points, you get one minute to make notes, then you speak alone for one to two minutes. Cover every bullet, spend most of your time on the final "and explain…" line, and keep talking until the examiner stops you — stopping early at 45 seconds is the most common way candidates lose marks here.',
      intro:
        'Part 2 is the only stretch of the test where you speak without interruption, and it is where fluency and coherence are most visible. The card always names a topic ("Describe a book that influenced you"), lists three or four prompts under "You should say", and ends with an "and explain…" line. The prompts are a suggested structure, not a checklist you must recite: examiners are listening for a connected talk, not four disconnected sentences.',
      tests:
        'Part 2 tests sustained, organised monologue: whether you can plan quickly, structure two minutes of speech, signal your organisation with discourse markers, and keep going without prompting. It samples narrative tenses, descriptive vocabulary and the ability to develop an idea rather than list facts — which is why the "and explain" line, not the bullets, carries most of the marks.',
      listeningFor: [
        'A talk that runs the full two minutes without long silences or a premature ending.',
        'Coherent organisation: an opening line, the bullets in a sensible order, a closing thought.',
        'Descriptive and evaluative language, not just a list of facts about the topic.',
        'Narrative control — consistent tenses when you tell the story behind the card.',
      ],
      steps: [
        'Use the full preparation minute: note keywords, not sentences, and jot one idea per bullet.',
        'Decide your specific example before you start — a real person, place or day, never a general category.',
        'Open by naming what you are going to describe, so the examiner hears immediately that you answered the card.',
        'Move through the bullets with clear signposts ("The reason I chose this…", "As for when it happened…").',
        'Save at least 30 seconds for the "and explain" line — develop it with a reason and a consequence.',
        'If you finish early, add a comparison ("Compared with…") or a future thought rather than falling silent.',
      ],
      traps: [
        'Stopping at 45–60 seconds. The examiner will not rescue you; the silence is graded.',
        'Reading your notes aloud, which flattens intonation and sounds memorised.',
        'Describing a general category ("books in general") instead of one specific instance.',
        'Rushing through the bullets in 30 seconds and then having nothing left to say.',
        'Forcing a memorised topic onto the card — examiners hear it instantly and the answer stops addressing the question.',
      ],
      timing:
        'One minute of preparation, then one to two minutes of speaking. Aim to still be talking at the two-minute mark so the examiner stops you — that is the target, not a failure. Roughly: 15 seconds introducing your choice, 60 seconds on the bullets, 30–45 seconds on the explanation.',
      faqs: [
        {
          q: 'How long should you speak in IELTS Speaking Part 2?',
          a: 'Between one and two minutes, and you should aim for the full two so the examiner stops you. Under a minute of speech gives too small a sample to score well.',
        },
        {
          q: 'What happens if you cannot think of a real example?',
          a: 'Invent one. The examiner is grading your English, not checking the facts — a well-told invented example scores exactly the same as a true one.',
        },
        {
          q: 'Do you have to cover every bullet point on the cue card?',
          a: 'The bullets are a suggested structure and covering them keeps you talking, but the final "and explain…" line matters most — it is where developed, band-raising language appears.',
        },
      ],
    },
  },

  'part-3': {
    slug: 'part-3',
    part: 3,
    label: 'Part 3',
    h1: 'IELTS Speaking Part 3: The Two-Way Discussion',
    title: 'IELTS Speaking Part 3: Discussion Questions & Answers | IELTS-Bank',
    description:
      'How IELTS Speaking Part 3 works: abstract discussion questions linked to your Part 2 topic, what the examiner listens for, and free practice questions by topic.',
    timingLine: '4–5 minutes of abstract discussion',
    guide: {
      answer:
        'Part 3 is a 4–5 minute discussion of the wider ideas behind your Part 2 topic. Questions are abstract — about society, change, causes and consequences — and are not about you. Answer with a clear position, one reason, one example or contrast, and roughly 40–60 seconds per answer. This is where Band 7 separates from Band 8.',
      intro:
        'Part 3 takes the concrete topic of your cue card and moves it up a level: from "a book that influenced you" to why reading habits are changing, whether governments should fund libraries, and how technology alters what people read. The examiner may challenge you, ask for the other side, or push you to justify a claim. That is not hostility — it is the test looking for the top of your range.',
      tests:
        'Part 3 tests whether you can discuss abstract ideas: speculate, compare, concede a point, justify an opinion and structure an argument in real time. It is the part of the test where less common vocabulary, complex structures and precise linking language have the most room to appear, and where short, undeveloped answers are most costly.',
      listeningFor: [
        'A clear position, stated early, then supported — not a list of unconnected observations.',
        'Speculative and hedging language ("it may well be that", "arguably", "on balance").',
        'Willingness to consider the other side and concede a point without losing the thread.',
        'Complex sentences that stay accurate: conditionals, relative clauses, comparatives.',
      ],
      steps: [
        'Answer the general question generally — do not retreat into a personal anecdote about yourself.',
        'State your view in the first sentence, then justify it with a reason and an example.',
        'Use a contrast to show range: "Historically…, whereas nowadays…" or "In wealthier countries…, but…".',
        'When the examiner challenges you, engage with the challenge — agreeing partly is a strong, natural move.',
        'If a question is hard, buy a moment out loud ("That is a difficult one to generalise about…") rather than pausing silently.',
      ],
      traps: [
        'Answering with "I" when the question asks about people in general.',
        'Giving 10-second answers, which is the single clearest sign of a candidate stuck below Band 7.',
        'Memorised opinion phrases stacked up with no content behind them.',
        'Drifting off the question while trying to use prepared vocabulary.',
        'Treating a challenge as a correction and abandoning a perfectly good argument.',
      ],
      timing:
        'Part 3 runs 4 to 5 minutes and you will be asked roughly six questions, so each answer is about 40 to 60 seconds — noticeably longer than Part 1. If the examiner keeps interrupting, you are running long; if they ask a rapid string of questions, your answers are too short.',
      faqs: [
        {
          q: 'How long should IELTS Speaking Part 3 answers be?',
          a: 'About 40 to 60 seconds — a position, a reason, and an example or contrast. That is roughly three times a Part 1 answer.',
        },
        {
          q: 'Are Part 3 questions related to your Part 2 cue card?',
          a: 'Yes. Part 3 develops the same theme in an abstract direction, which is why practising a cue card together with its linked discussion questions is the most realistic preparation.',
        },
        {
          q: 'What if you disagree with the examiner in Part 3?',
          a: 'Disagreeing is fine and often earns better language. The examiner has no opinion of their own — the challenge is a prompt for you to justify your view.',
        },
      ],
    },
  },
};

export const SPEAKING_PART_SLUGS = Object.keys(SPEAKING_PARTS);

export function getSpeakingPartSeo(partSlug) {
  const config = SPEAKING_PARTS[partSlug];
  if (!config) return null;
  const canonical = `${SITE_URL}/speaking/${partSlug}`;
  return {
    title: config.title,
    description: config.description,
    canonical,
    ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
      config.h1
    )}&type=speaking&subtitle=${encodeURIComponent(config.label)}`,
    imageAlt: `${config.h1} — IELTS-Bank`,
  };
}

export const SPEAKING_PART_LINKS = SPEAKING_PART_SLUGS.map((slug) => ({
  slug,
  label: SPEAKING_PARTS[slug].label,
}));
