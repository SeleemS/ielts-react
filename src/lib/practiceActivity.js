// src/lib/practiceActivity.js
// A tiny, consent-independent counter of graded practice submissions in the
// current browser session. Drives the "every few questions" promo
// reminder (src/components/OfferReminderModal.jsx) — a product feature, so it
// must NOT be gated on analytics consent.
//
// One increment per graded submit across every skill:
//   reading / listening / mock -> 'attempt_submit'
//   writing                    -> 'writing_submit'
//   speaking                   -> 'speaking_submit'
// Fed from the single analytics chokepoint, track() in src/lib/analytics.js,
// which calls recordPracticeActivity(event) before its own consent gate.
//
// Everything fails soft: storage errors must never break a submit flow.

const COUNT_KEY = 'ielts-practice-activity';
export const PRACTICE_EVENT = 'ielts:practice-activity';

const GRADED_SUBMIT_EVENTS = new Set([
  'attempt_submit',
  'writing_submit',
  'speaking_submit',
]);

export function isGradedSubmitEvent(event) {
  return GRADED_SUBMIT_EVENTS.has(event);
}

export function getPracticeActivityCount() {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = Number(window.sessionStorage.getItem(COUNT_KEY) || 0);
    return Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
  } catch {
    return 0;
  }
}

// Increment the session counter for a graded submit and notify listeners with
// the new total. Non-submit events are ignored. Returns the new count (or the
// unchanged count when the event does not qualify).
export function recordPracticeActivity(event) {
  if (typeof window === 'undefined' || !isGradedSubmitEvent(event)) {
    return getPracticeActivityCount();
  }
  let next = getPracticeActivityCount() + 1;
  try {
    window.sessionStorage.setItem(COUNT_KEY, String(next));
  } catch {
    /* private mode / storage full — still notify with the in-memory value */
  }
  try {
    window.dispatchEvent(new CustomEvent(PRACTICE_EVENT, { detail: { count: next } }));
  } catch {
    /* CustomEvent unsupported — non-fatal */
  }
  return next;
}
