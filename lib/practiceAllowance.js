// Free-account practice allowance for Reading & Listening.
//
// Signed-out visitors get one free question per skill (src/lib/freeAttempts.js).
// A free account then gets FREE_PRACTICE_TESTS distinct marked practice tests
// in total (Reading + Listening combined, lifetime). Re-submitting a passage
// already used stays free; mock tests have their own Pro gate. Pro removes the
// limit. Every question page stays readable (and the answer pages indexable) —
// only instant marking of further new passages needs Pro.
//
// Config: NEXT_PUBLIC_FREE_PRACTICE_TESTS — a positive integer, or "unlimited"
// to switch the wall off without a code change (rollback lever). Default 3.

const DEFAULT_LIMIT = 3;

export function parseFreePracticeLimit(raw) {
  if (raw == null || String(raw).trim() === '') return DEFAULT_LIMIT;
  const value = String(raw).trim().toLowerCase();
  if (value === 'unlimited' || value === 'off') return Infinity;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_LIMIT;
}

export const FREE_PRACTICE_TESTS = parseFreePracticeLimit(process.env.NEXT_PUBLIC_FREE_PRACTICE_TESTS);
export const PRACTICE_WALL_ON = Number.isFinite(FREE_PRACTICE_TESTS);

// usedIds: Set of passage ids this account already submitted (non-mock).
// currentId: the passage being submitted (null when unresolved).
export function practiceAllowanceState({ usedIds, currentId, limit = FREE_PRACTICE_TESTS, isPremium = false }) {
  const used = usedIds instanceof Set ? usedIds.size : 0;
  if (isPremium || !Number.isFinite(limit)) {
    return { limited: false, used, limit, remaining: Infinity, canSubmit: true };
  }
  const isRetry = Boolean(currentId) && usedIds instanceof Set && usedIds.has(currentId);
  const remaining = Math.max(0, limit - used);
  return { limited: true, used, limit, remaining, canSubmit: isRetry || remaining > 0, isRetry };
}

const plural = (n) => `${n} practice test${n === 1 ? '' : 's'}`;

export function practiceAllowanceCopy(limit = FREE_PRACTICE_TESTS) {
  if (!Number.isFinite(limit)) {
    return {
      freeTier: 'The full Reading & Listening bank with instant marking',
      freeMarking: 'Instant marking with answer keys',
      proLine: null,
      pricingFaq: 'The full Reading and Listening question bank stays free with instant marking',
      signUpDescription:
        'Your answers are safe — create a free account to see your score and track your progress. Reading and listening practice stays free.',
      bankFaq: (count) =>
        `Yes. All ${count} Reading and Listening questions are free, with instant marking that shows the correct answer to every question`,
    };
  }
  return {
    // Pricing FREE_INCLUDES bullet, comparison row and the homepage strip.
    freeTier: `Every Reading & Listening question with answer keys, plus ${plural(limit)} with instant marking`,
    freeMarking: `${plural(limit)[0].toUpperCase()}${plural(limit).slice(1)} with instant marking`,
    proLine: 'Unlimited marked Reading & Listening practice',
    pricingFaq: `Every Reading and Listening question and answer key is free to read, and a free account includes ${plural(limit)} with instant marking and a band estimate`,
    signUpDescription: `Your answers are safe — create a free account to see your score. Free accounts include ${plural(limit)} with instant marking.`,
    bankFaq: (count) =>
      `Every one of the ${count} Reading and Listening questions is free to read, with a free answer key for each passage. A free account includes ${plural(limit)} with instant marking and a band estimate; Pro adds unlimited marked practice`,
  };
}
