// topic-schema.mjs
// -----------------------------------------------------------------------------
// Shared contract for the Part 2 cue-card topic bank
// (scripts/content/speaking/topics.json) and the batch generator that turns it
// into published speaking items.
//
// Imported by:
//   scripts/content/speaking/generate-speaking.mjs   (the pipeline)
//   tests/speaking-topic-bank.test.js                (vitest coverage)
//
// Everything here is pure + dependency-free so the validator can run in a test
// with no env, no network and no DB.

// ---------------------------------------------------------------------------
// Topic families. MUST stay in sync with lib/speakingTopicFamilies.js (the hub
// pages) — tests/speaking-topic-bank.test.js asserts the two lists match.
// ---------------------------------------------------------------------------
export const TOPIC_FAMILIES = [
  'people',
  'places',
  'objects',
  'events',
  'experiences',
  'activities',
  'media',
  'work-study',
  'technology',
  'nature',
  'food',
  'travel',
  'health',
  'money',
  'culture',
  'future-plans',
];

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

// Claims we must never make about our own content (content policy: everything
// is original and AI-authored; nothing is an official or reproduced exam item).
export const BANNED_PHRASES = [
  'past paper',
  'past papers',
  'real test question',
  'real exam question',
  'actual test question',
  'actual exam question',
  'recent actual test',
  'official ielts',
  'ielts official',
  'leaked',
  'exam memory',
];

// Length caps, in words. Cue cards are read aloud by the examiner voice, so an
// over-long card sounds wrong and costs TTS characters for no benefit.
export const LIMITS = {
  titleWords: 12,
  bulletWords: 10,
  explainWords: 22,
  part1QuestionWords: 18,
  part3QuestionWords: 26,
  bulletsMin: 3,
  bulletsMax: 4,
  part1Count: 3,
  part3Count: 4,
};

const words = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).length;

export function containsBannedPhrase(text) {
  const haystack = String(text || '').toLowerCase();
  return BANNED_PHRASES.find((phrase) => haystack.includes(phrase)) || null;
}

// ---------------------------------------------------------------------------
// Slug / title helpers — the DB slug algorithm is IDENTICAL to the one the
// original speaking importer used, so re-running the pipeline is idempotent and
// new items sit in the same URL namespace as the first 80.
// ---------------------------------------------------------------------------
const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'onto',
  'or', 'per', 'the', 'to', 'up', 'via', 'with', 'vs',
]);

// Title-case a cue-card line the way the existing 80 items are titled
// ("Describe a Book That Influenced You"). First and last word always capitalise.
export function titleCase(input) {
  const parts = String(input || '').trim().split(/\s+/);
  return parts
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index !== 0 && index !== parts.length - 1 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

// The passages.title stored in the DB for a topic.
export function passageTitleFor(topic) {
  return `IELTS Speaking Cue Card: ${titleCase(topic.title)}`;
}

function slugify(str) {
  return (
    String(str || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'passage'
  );
}

function shortHash(input) {
  let h = 5381;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36).slice(0, 6);
}

// Same stable slug as scripts/content/speaking/generate-speaking.mjs has always
// produced: slugify(title) + a hash of `speaking::<title>`.
export function stableSlug(passageTitle) {
  return `${slugify(passageTitle)}-${shortHash(`speaking::${passageTitle}`)}`;
}

export function passageSlugFor(topic) {
  return stableSlug(passageTitleFor(topic));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export function validateTopic(topic, index = 0) {
  const errors = [];
  const where = topic?.slug || `#${index}`;
  const push = (msg) => errors.push(`${where}: ${msg}`);

  if (!topic || typeof topic !== 'object') return [`#${index}: not an object`];
  if (!topic.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(topic.slug)) push('slug must be kebab-case');
  if (!TOPIC_FAMILIES.includes(topic.family)) push(`family "${topic.family}" is not a known family`);
  if (!DIFFICULTIES.includes(topic.difficulty)) push(`difficulty "${topic.difficulty}" is invalid`);

  if (!topic.title || !/^Describe /.test(topic.title)) push('title must start with "Describe "');
  else if (words(topic.title) > LIMITS.titleWords) push(`title is longer than ${LIMITS.titleWords} words`);

  const bullets = Array.isArray(topic.bullets) ? topic.bullets : [];
  if (bullets.length < LIMITS.bulletsMin || bullets.length > LIMITS.bulletsMax) {
    push(`needs ${LIMITS.bulletsMin}-${LIMITS.bulletsMax} "You should say" bullets`);
  }
  bullets.forEach((bullet, i) => {
    if (!bullet || typeof bullet !== 'string') push(`bullet ${i + 1} is empty`);
    else if (words(bullet) > LIMITS.bulletWords) push(`bullet ${i + 1} is longer than ${LIMITS.bulletWords} words`);
    else if (/^[A-Z]/.test(bullet)) push(`bullet ${i + 1} should not start with a capital letter`);
  });

  if (!topic.explain || !/^and explain /.test(topic.explain)) push('explain must start with "and explain "');
  else if (words(topic.explain) > LIMITS.explainWords) push(`explain is longer than ${LIMITS.explainWords} words`);
  else if (!/[.?]$/.test(topic.explain.trim())) push('explain must end with a full stop');

  const part1 = Array.isArray(topic.part1) ? topic.part1 : [];
  if (part1.length !== LIMITS.part1Count) push(`needs exactly ${LIMITS.part1Count} linked Part 1 questions`);
  part1.forEach((q, i) => {
    if (!/\?$/.test(String(q).trim())) push(`part1 question ${i + 1} must end with "?"`);
    if (words(q) > LIMITS.part1QuestionWords) push(`part1 question ${i + 1} is too long`);
  });

  const part3 = Array.isArray(topic.part3) ? topic.part3 : [];
  if (part3.length !== LIMITS.part3Count) push(`needs exactly ${LIMITS.part3Count} linked Part 3 questions`);
  part3.forEach((q, i) => {
    if (!/\?$/.test(String(q).trim())) push(`part3 question ${i + 1} must end with "?"`);
    if (words(q) > LIMITS.part3QuestionWords) push(`part3 question ${i + 1} is too long`);
  });

  const corpus = [topic.title, topic.explain, ...bullets, ...part1, ...part3].join(' ');
  const banned = containsBannedPhrase(corpus);
  if (banned) push(`contains banned phrase "${banned}"`);

  return errors;
}

// Normalise a title to a comparable "noun phrase" key so two cards about the
// same thing collide even when the wording differs.
const DEDUPE_STOP = new Set([
  'describe', 'a', 'an', 'the', 'you', 'your', 'that', 'who', 'which', 'is', 'are', 'was', 'were', 'have',
  'has', 'had', 'to', 'of', 'in', 'on', 'at', 'it', 'and', 'or', 'for', 'with', 'like', 'would', 'will',
  'do', 'did', 'be', 'been', 'me', 'my', 'i', 'often', 'really', 'very', 'some', 'something', 'someone',
  'people', 'this', 'they', 'them', 'their', 'when', 'where', 'what', 'how', 'why', 'from', 'by', 'as',
  'not', 'no', 'yes', 'one', 'more', 'most', 'than', 'so', 'if', 'but', 'about', 'into', 'out', 'up',
  'again', 'also', 'just', 'only', 'other', 'others', 'new', 'good', 'bad', 'well', 'much', 'many', 'ever',
]);

export function dedupeKey(title) {
  return new Set(
    String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !DEDUPE_STOP.has(w))
  );
}

// Jaccard similarity of the content words of two cue-card titles.
export function titleSimilarity(a, b) {
  const setA = dedupeKey(a);
  const setB = dedupeKey(b);
  if (!setA.size || !setB.size) return 0;
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  return intersection / new Set([...setA, ...setB]).size;
}

export const NEAR_DUPLICATE_THRESHOLD = 0.6;

// Validate the whole bank: per-topic schema, unique slugs, unique/near-unique
// titles, and (optionally) no near-duplicates of titles already in the DB.
export function validateTopicBank(topics, { existingTitles = [] } = {}) {
  const errors = [];
  if (!Array.isArray(topics)) return { errors: ['topics.json must be an array'], nearDuplicates: [] };

  topics.forEach((topic, index) => errors.push(...validateTopic(topic, index)));

  const seenSlug = new Map();
  const seenTitle = new Map();
  for (const topic of topics) {
    if (seenSlug.has(topic?.slug)) errors.push(`duplicate slug "${topic.slug}"`);
    else seenSlug.set(topic?.slug, true);
    const titleKey = String(topic?.title || '').toLowerCase();
    if (seenTitle.has(titleKey)) errors.push(`duplicate title "${topic.title}"`);
    else seenTitle.set(titleKey, true);
  }

  const nearDuplicates = [];
  for (let i = 0; i < topics.length; i += 1) {
    for (let j = i + 1; j < topics.length; j += 1) {
      const score = titleSimilarity(topics[i]?.title, topics[j]?.title);
      if (score >= NEAR_DUPLICATE_THRESHOLD) {
        nearDuplicates.push({ a: topics[i].title, b: topics[j].title, score });
      }
    }
    for (const existing of existingTitles) {
      const score = titleSimilarity(topics[i]?.title, existing);
      if (score >= NEAR_DUPLICATE_THRESHOLD) {
        nearDuplicates.push({ a: topics[i].title, b: existing, score, existing: true });
      }
    }
  }

  return { errors, nearDuplicates };
}

// ---------------------------------------------------------------------------
// topic -> authored item (the shape generate-speaking.mjs already understands)
// ---------------------------------------------------------------------------
export function topicToItem(topic) {
  return {
    part: 2,
    title: passageTitleFor(topic),
    difficulty: topic.difficulty,
    // First tag is ALWAYS the family slug: lib/speakingTopicFamilies.js reads it
    // back to group cards on the family hubs.
    topicTags: [topic.family, 'cue-card', 'part2'],
    cueCard: {
      topic: `${topic.title}.`,
      bullets: topic.bullets,
      explainLine: topic.explain,
      // Linked question sets travel inside the cue_card jsonb (no migration
      // needed) and feed /speaking/part-1 and /speaking/part-3.
      linkedPart1: topic.part1,
      linkedPart3: topic.part3,
      family: topic.family,
    },
    roundOff: [],
    __topicSlug: topic.slug,
    __family: topic.family,
  };
}
