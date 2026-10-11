// lib/freeScorePeriod.js
// Single switch for how the FREE AI score allowance is described and shown.
//
//   NEXT_PUBLIC_FREE_SCORE_PERIOD=weekly  -> "1 free AI Writing + 1 free AI
//       Speaking score every week", with "Your next free score unlocks on
//       <date>" hints. Set this ONLY after consume_ai_score v10 is live
//       (scripts/apply-weekly-free-score.mjs), then redeploy — NEXT_PUBLIC_*
//       values are inlined at build time.
//   unset / anything else -> today's lifetime copy ("one lifetime sample").
//
// The server (consume_ai_score) always owns the entitlement decision; this
// flag only changes copy and the client-side "is this week's sample used?"
// hint. With the flag unset the app behaves exactly as before, whether or not
// the migration has been applied. See docs/growth-2026-09-23/WEEKLY-FREE-SCORE.md.

import { practiceAllowanceCopy } from './practiceAllowance';

// Must match v_free_window in
// supabase/migrations/20260923120000_weekly_free_ai_score.sql.
export const FREE_SCORE_WINDOW_DAYS = 7;
const WINDOW_MS = FREE_SCORE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function resolveFreeScorePeriod(value) {
  return String(value || '').trim().toLowerCase() === 'weekly' ? 'weekly' : 'lifetime';
}

// Referenced literally so Next.js can inline it into client bundles.
export const FREE_SCORE_PERIOD = resolveFreeScorePeriod(process.env.NEXT_PUBLIC_FREE_SCORE_PERIOD);
export const IS_WEEKLY_FREE_SCORE = FREE_SCORE_PERIOD === 'weekly';

function toTime(value) {
  if (value == null || value === '') return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

// When this skill's free sample refills, or null (never used, lifetime mode,
// or an unreadable timestamp).
export function nextFreeScoreAt(usedAt, period = FREE_SCORE_PERIOD) {
  if (period !== 'weekly') return null;
  const used = toTime(usedAt);
  return used == null ? null : new Date(used + WINDOW_MS);
}

// Display-only mirror of the SQL rule: lifetime = ever used; weekly = used
// within the last 7 days (a refill exactly at the boundary is available).
export function isFreeSampleUsed(usedAt, { period = FREE_SCORE_PERIOD, now = Date.now() } = {}) {
  const used = toTime(usedAt);
  if (used == null) return false;
  if (period !== 'weekly') return true;
  return used + WINDOW_MS > toTime(now);
}

// "Tue 30 Sep" in the viewer's own time zone (pass timeZone for tests).
export function formatFreeScoreDate(value, { timeZone } = {}) {
  const time = toTime(value);
  if (time == null) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(time));
}

// "Your next free Writing score unlocks on Tue 30 Sep." — empty when there is
// nothing truthful to say (lifetime mode, or no date).
export function nextFreeScoreHint(nextAt, { skill = 'writing', period = FREE_SCORE_PERIOD, timeZone } = {}) {
  if (period !== 'weekly') return '';
  const date = formatFreeScoreDate(nextAt, { timeZone });
  if (!date) return '';
  const label = skill === 'speaking' ? 'Speaking' : 'Writing';
  return `Your next free ${label} score unlocks on ${date}.`;
}

const PRACTICE = practiceAllowanceCopy();

const COPY = {
  lifetime: {
    // pricing.jsx — FREE_INCLUDES bullet + comparison row
    allowanceLine: 'One lifetime Writing sample + one Speaking sample score',
    // pricing.jsx — "What is free" FAQ (also emitted as FAQPage JSON-LD)
    pricingFaq:
      `${PRACTICE.pricingFaq}, and you get one lifetime Writing sample score plus one Speaking sample score.`,
    // pricing.jsx — line under the plan cards
    pricingStart: 'Start with a free Writing and a free Speaking sample score.',
    // HomePage hero form footnote
    heroFootnote: 'Free means one AI Writing report per account — a single lifetime sample.',
    // HomePage "Free forever" tier summary
    homeFreeTier: 'plus one free AI Writing and one Speaking sample score.',
    // /ielts-writing-checker intro
    checkerIntro: 'Create an account for one free Writing sample:',
    // Short lines used by the redesigned hero and checker intro
    heroFreeLine: 'One free AI Writing report per account.',
    checkerFreeLine: 'Your first report is free.',
    // /speakingquestion index intro
    speakingIndex: 'each account includes one lifetime Speaking sample score.',
    // PracticeFeedbackEntry (blog + practice indexes)
    practiceEntry:
      'One free sample per skill, per account. Already used yours? You can still practise for free; further AI scoring requires Pro.',
    // FreeSampleChip (writing submit CTA)
    chipSignedOut: 'Includes one free AI score — sign in when you submit to use it.',
    chipUsed: 'Your free sample is used — Pro scores this essay in full.',
    chipAvailable: 'Your free AI score is available for this essay.',
    // AiQuotaPanel non-premium branch
    quotaUsedWriting: 'You’ve used your lifetime free Writing sample.',
    quotaUsedSpeaking: 'You’ve used your lifetime free Speaking sample.',
    // lifecycle welcome email
    welcomeEmailIntro: 'Your account includes one lifetime AI Writing sample score.',
    // pages/dashboard.js empty-state nudge
    dashboardBaseline:
      'Start with Reading or Listening, then use your free Writing and Speaking sample scores (one of each per account) to complete a four-skill baseline. Pro adds continued AI scoring with full reports.',
  },
  weekly: {
    allowanceLine: '1 free AI Writing + 1 free AI Speaking score every week',
    pricingFaq:
      `${PRACTICE.pricingFaq}, and every free account gets one AI Writing score and one AI Speaking score each week (a shorter free report). Each refills 7 days after you use it.`,
    pricingStart: 'Start with a free Writing and a free Speaking score every week.',
    heroFootnote: 'Free means one AI Writing report every week — it refills 7 days after you use it.',
    homeFreeTier: 'plus one free AI Writing and one AI Speaking score every week.',
    checkerIntro: 'Create an account for a free Writing score every week:',
    heroFreeLine: 'One free AI Writing report every week.',
    checkerFreeLine: 'You get one free report every week.',
    speakingIndex: 'each account gets one free Speaking score every week.',
    practiceEntry:
      'One free score per skill every week. Used this week’s? You can still practise for free, wait for next week’s, or get continued AI scoring with Pro.',
    chipSignedOut: 'Includes a free AI score every week — sign in when you submit to use it.',
    chipUsed: 'This week’s free score is used — Pro scores this essay in full now.',
    chipAvailable: 'This week’s free AI score is available for this essay.',
    quotaUsedWriting: 'You’ve used this week’s free Writing score.',
    quotaUsedSpeaking: 'You’ve used this week’s free Speaking score.',
    welcomeEmailIntro: 'Your account includes a free AI Writing score every week.',
    dashboardBaseline:
      'Start with Reading or Listening, then use this week’s free Writing and Speaking scores to complete a four-skill baseline. Pro adds continued AI scoring with full reports.',
  },
};

export function freeScoreCopy(period = FREE_SCORE_PERIOD) {
  return COPY[period === 'weekly' ? 'weekly' : 'lifetime'];
}
