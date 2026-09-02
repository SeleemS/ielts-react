// lib/task2Roundup.js
// Pure logic behind /ielts-writing-task-2-topics/<month> — month-slug parsing,
// which months get a page, and how a month's prompts are grouped by frame.
//
// THE RESILIENCE RULE: a monthly page must never be blank or thin. Prompts are
// seeded in bursts, so a given calendar month may add nothing at all. When that
// happens the page still publishes, but it says plainly that no new prompts
// were added that month and shows the most recently added ones instead. What it
// must never do is imply that stale prompts are new — hence `isNew` per prompt
// and `source` on the roundup, which the page renders as visible wording.

import { TASK2_FRAMES } from './task2Frames';

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// A page shows at least this many prompts; below it, recent prompts top it up.
export const MIN_PROMPTS_PER_MONTH = 12;

export function monthSlugFor(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${MONTH_NAMES[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/**
 * "september-2026" -> { slug, year, monthIndex, label: 'September 2026',
 * isoMonth: '2026-09' }. Returns null for anything malformed, which is how the
 * route 404s instead of rendering a page for "/banana-3".
 */
export function parseMonthSlug(slug) {
  const match = /^([a-z]+)-(\d{4})$/.exec(String(slug || ''));
  if (!match) return null;
  const monthIndex = MONTH_NAMES.indexOf(match[1]);
  const year = Number(match[2]);
  if (monthIndex === -1 || year < 2000 || year > 2999) return null;
  const label = `${MONTH_NAMES[monthIndex][0].toUpperCase()}${MONTH_NAMES[monthIndex].slice(1)} ${year}`;
  return {
    slug: `${MONTH_NAMES[monthIndex]}-${year}`,
    year,
    monthIndex,
    label,
    isoMonth: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
  };
}

/**
 * The months that get a page: every month from `count` months ago up to the
 * month containing `now`, newest first. Future months are never generated — we
 * do not publish a roundup for a month that has not happened.
 */
export function listRoundupMonths(now = new Date(), count = 6) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - i, 1));
    return monthSlugFor(d);
  });
}

/** True when `slug` names a real month at or before the month containing `now`. */
export function isPublishableMonth(slug, now = new Date()) {
  const month = parseMonthSlug(slug);
  if (!month) return false;
  return month.isoMonth <= monthSlugToIso(monthSlugFor(now));
}

function monthSlugToIso(slug) {
  return parseMonthSlug(slug).isoMonth;
}

/**
 * Build the roundup for one month.
 *
 * `source` is the honest label for what the reader is looking at:
 *   'new'    — every prompt shown was added in that month
 *   'mixed'  — some were added that month, topped up with recent ones
 *   'recent' — nothing was added that month; these are the newest in the bank
 */
export function buildMonthlyRoundup(prompts, monthSlug, { now = new Date(), min = MIN_PROMPTS_PER_MONTH } = {}) {
  const month = parseMonthSlug(monthSlug);
  if (!month) return null;

  const all = [...prompts].sort((a, b) =>
    a.added < b.added ? 1 : a.added > b.added ? -1 : a.slug.localeCompare(b.slug)
  );

  const addedThisMonth = all.filter((p) => String(p.added).slice(0, 7) === month.isoMonth);
  const seen = new Set(addedThisMonth.map((p) => p.slug));
  // Top-up pool: never includes prompts added AFTER the month being described,
  // so an archived page cannot show a prompt that did not exist yet.
  const fallback = all.filter(
    (p) => !seen.has(p.slug) && String(p.added).slice(0, 7) < month.isoMonth
  );

  const selected = [...addedThisMonth];
  while (selected.length < min && fallback.length) selected.push(fallback.shift());

  const source =
    addedThisMonth.length >= min ? 'new' : addedThisMonth.length ? 'mixed' : 'recent';

  const items = selected.map((prompt) => ({
    ...prompt,
    isNew: seen.has(prompt.slug),
  }));

  const groups = TASK2_FRAMES.map((frame) => ({
    frame,
    prompts: items.filter((p) => p.frame === frame.id),
  })).filter((group) => group.prompts.length);

  // dateModified for the JSON-LD: the newest real timestamp behind the page,
  // clamped to today so an archived month never claims a future revision.
  const newestTouch = items
    .map((p) => p.updated || p.added)
    .sort()
    .pop();
  const today = new Date(now).toISOString().slice(0, 10);

  return {
    month,
    source,
    addedThisMonthCount: addedThisMonth.length,
    totalCount: items.length,
    groups,
    dateModified: newestTouch && newestTouch < today ? newestTouch : today,
  };
}
