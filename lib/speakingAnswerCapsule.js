// lib/speakingAnswerCapsule.js
// Builds the "Quick answer" capsule shown directly under the H1 of every
// speaking practice page (the same above-the-fold pattern the reading and
// listening hubs use, and the strongest shared trait of pages AI assistants
// quote).
//
// DETERMINISTIC: template + the item's own fields. Nothing here calls a model
// at request time — the page is statically generated and must build with no
// network access.

const PART_LABELS = { 1: 'Part 1', 2: 'Part 2', 3: 'Part 3' };

// "who this neighbour is" / "how long you have known them" -> a readable list.
function joinBullets(bullets = []) {
  const clean = bullets.map((b) => String(b || '').trim().replace(/[.;]$/, '')).filter(Boolean);
  if (!clean.length) return '';
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

// "and explain why you get on so well with this person." -> "why you get on so
// well with this person"
function explainClause(explainLine) {
  return String(explainLine || '')
    .trim()
    .replace(/^and\s+explain\s+/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
}

function stripTrailingPunctuation(text) {
  return String(text || '').trim().replace(/[.!?]+$/, '').trim();
}

// One trap per part, specialised for cue cards by what the card asks for.
function trapFor(item) {
  if (item?.part === 2) {
    const topic = `${item?.cueCard?.topic || item?.topic || ''}`.toLowerCase();
    if (/\btime\b|\bday\b|\boccasion\b|memory|when you/.test(topic)) {
      return 'The trap: drifting between past and present. Tell it as one finished story and keep your narrative tenses consistent.';
    }
    if (/would like|you would|plan|future|hope/.test(topic)) {
      return 'The trap: slipping into the present tense. This card is hypothetical, so stay in "would", "going to" and "I am hoping to" throughout.';
    }
    if (/^describe (a|an|the) (person|friend|neighbour|child|couple|someone|teacher|classmate|colleague|stranger)/.test(topic)) {
      return 'The trap: listing adjectives about the person. Give one concrete story that shows what they are like instead of describing them abstractly.';
    }
    return 'The trap: stopping after 45 seconds. Keep going until the examiner interrupts you — a short long turn is the most common way marks are lost here.';
  }
  if (item?.part === 1) {
    return 'The trap: one-word answers. Every reply needs a reason or example attached, or there is nothing for the examiner to grade.';
  }
  return 'The trap: answering with a personal anecdote. Part 3 questions are about people in general, so argue at that level.';
}

// The 2–3 sentence capsule. Returns null when there is not enough data.
export function buildSpeakingAnswerCapsule(item) {
  if (!item || (item.part !== 1 && item.part !== 2 && item.part !== 3)) return null;

  if (item.part === 2) {
    const cue = item.cueCard || {};
    const topic = stripTrailingPunctuation(cue.topic || item.topic || item.title);
    if (!topic) return null;
    const bullets = joinBullets(cue.bullets);
    const explain = explainClause(cue.explainLine);
    const prep = cue.prepSeconds || 60;
    const min = cue.speakSecondsMin || 60;
    const max = cue.speakSecondsMax || 120;

    const what = bullets
      ? `${topic}: say ${bullets}${explain ? `, then explain ${explain}` : ''}.`
      : `${topic}.`;
    const how =
      `You get ${prep} seconds to make notes and then speak alone for ${Math.round(min / 60)}–${Math.round(
        max / 60
      )} minutes. Spend about 15 seconds naming your choice, a minute on the bullet points, ` +
      `and the last 30–45 seconds on the explanation, where the marks are.`;
    return { headline: what, structure: how, trap: trapFor(item) };
  }

  const label = PART_LABELS[item.part];
  const set = item.part === 1 ? item.part1 : item.part3;
  const topic = stripTrailingPunctuation(item.topic || set?.topic || set?.theme || item.title);
  const count = Array.isArray(set?.questions) ? set.questions.length : 0;
  const what =
    item.part === 1
      ? `${label} questions on ${topic || 'a familiar topic'}${count ? ` — ${count} of them` : ''}: answer each one directly, then add a reason or an example.`
      : `${label} discussion questions on ${topic || 'this theme'}${count ? ` — ${count} of them` : ''}: give a clear position, then justify it.`;
  const how =
    item.part === 1
      ? 'Keep each answer to two or three sentences, roughly 20 seconds. The whole part lasts 4–5 minutes, so the examiner needs room for about a dozen questions.'
      : 'Aim for 40–60 seconds per answer: position, reason, then an example or a contrast. The part lasts 4–5 minutes across about six questions.';
  return { headline: what, structure: how, trap: trapFor(item) };
}

// Flat string version — used for meta descriptions and JSON-LD.
export function speakingAnswerCapsuleText(item) {
  const capsule = buildSpeakingAnswerCapsule(item);
  if (!capsule) return '';
  return [capsule.headline, capsule.structure, capsule.trap].join(' ');
}
