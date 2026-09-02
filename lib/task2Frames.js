// lib/task2Frames.js
// The six IELTS Writing Task 2 question frames, and a classifier that decides
// which frame a prompt uses from its own wording.
//
// WHY A CLASSIFIER RATHER THAN A HAND-TAGGED LIST: the frame is not an opinion
// about a prompt, it is a property of the instruction sentence — "Discuss both
// views" is a discussion essay whatever the topic. Deriving it from the text
// means a newly seeded prompt is grouped correctly by
// scripts/content/sync-task2-prompts.mjs without anyone re-tagging it, and the
// monthly roundup pages can never drift from the prompt bank.
//
// ORDER IS LOAD-BEARING. Prompts often combine wordings ("Discuss both views
// and give your own opinion" contains "your opinion"; a two-part question can
// end "…and what problems does it cause?"). Each rule is tried in the order
// below, most specific first, and the first match wins.

export const TASK2_FRAMES = [
  {
    id: 'opinion',
    name: 'Opinion (agree or disagree)',
    typicalWording: '"To what extent do you agree or disagree?"',
    howToAnswer:
      'State one clear position in the introduction and defend that same position in every body paragraph.',
  },
  {
    id: 'discussion',
    name: 'Discussion (discuss both views)',
    typicalWording: '"Discuss both views and give your own opinion."',
    howToAnswer:
      'Give one body paragraph to each view, then make your own position explicit — an essay that covers both sides but never commits is capped.',
  },
  {
    id: 'advantages-disadvantages',
    name: 'Advantages and disadvantages',
    typicalWording: '"Do the advantages outweigh the disadvantages?"',
    howToAnswer:
      'Cover both sides, and when the prompt says "outweigh", deliver an explicit verdict rather than a summary.',
  },
  {
    id: 'problem-solution',
    name: 'Problem and solution',
    typicalWording: '"What problems does this cause? What can be done about it?"',
    howToAnswer:
      'One paragraph for the causes or problems and one for solutions, with each solution answering a problem you actually raised.',
  },
  {
    id: 'positive-negative',
    name: 'Positive or negative development',
    typicalWording: '"Is this a positive or a negative development?"',
    howToAnswer:
      'Judge the change itself — positive, negative or mixed — and justify the judgement with consequences.',
  },
  {
    id: 'two-part',
    name: 'Two-part question',
    typicalWording: 'Two direct questions in one prompt.',
    howToAnswer:
      'Answer both questions fully, one body paragraph each; leaving either unanswered caps Task Response.',
  },
];

export const TASK2_FRAME_IDS = TASK2_FRAMES.map((frame) => frame.id);

// Matched in order; first hit wins. See the ORDER note above.
const RULES = [
  ['discussion', /discuss both (?:these )?(?:views|sides|opinions)/],
  ['advantages-disadvantages', /advantages? (?:and|or) (?:the )?disadvantages?|disadvantages? (?:and|or) (?:the )?advantages?|advantages? outweigh|drawbacks? outweigh|benefits? (?:and|or) drawbacks?|outweigh the (?:advantages|disadvantages|benefits|drawbacks)/],
  ['positive-negative', /positive or (?:a )?negative (?:development|trend|change)|negative or (?:a )?positive (?:development|trend|change)|(?:a )?good or (?:a )?bad (?:development|thing|trend)|positive development or/],
  ['opinion', /to what extent do you agree|do you agree or disagree|how far do you agree|to what extent do you think this|agree or disagree\?/],
  ['problem-solution', /what problems?|what are the (?:causes|reasons|problems)|what (?:can|could|should) be done|what (?:solutions|measures|steps)|how (?:can|could) (?:this|these|the) (?:problem|problems|situation|issue)|why (?:has|is) this (?:happened|happening)|what has caused/],
];

/**
 * Decide which of the six Task 2 frames a prompt uses.
 * Returns a frame id, or 'opinion' as the documented fallback: an
 * instruction-less prompt is answered as a position essay, and mis-grouping a
 * prompt is far better than dropping it from the roundup entirely.
 *
 * A prompt that asks two distinct questions and matches no single-frame rule is
 * a two-part question — that is exactly what the frame means.
 */
export function classifyTask2Frame(promptText) {
  const text = String(promptText || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!text) return 'opinion';

  // Strip the boilerplate that wraps almost every prompt, so "give reasons for
  // your answer" cannot be read as an opinion instruction.
  const core = text
    .replace(/give reasons for your answer[^.?]*\.?/g, ' ')
    .replace(/include any relevant examples[^.?]*\.?/g, ' ')
    .replace(/write at least \d+ words\.?/g, ' ')
    .replace(/write about the following topic:?/g, ' ');

  for (const [frameId, pattern] of RULES) {
    if (pattern.test(core)) return frameId;
  }

  // No named instruction: two or more direct questions means a two-part prompt.
  const questions = (core.match(/\?/g) || []).length;
  return questions >= 2 ? 'two-part' : 'opinion';
}

export function frameById(id) {
  return TASK2_FRAMES.find((frame) => frame.id === id) || null;
}
