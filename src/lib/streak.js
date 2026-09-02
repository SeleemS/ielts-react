// src/lib/streak.js
// Shared practice-streak logic: one source of truth for the dashboard, the
// post-submit results summary, and the navbar badge. A "practice day" is any
// local calendar day with at least one attempt; the streak counts consecutive
// days ending today (or yesterday, so an unbroken run isn't shown as 0 before
// today's practice happens). Everything is computed from real stored attempts.

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

export function localDateKey(value) {
  // new Date(null) is the epoch, not an error — an empty timestamp must not
  // silently count as a practice day in 1970.
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// dates: iterable of date-like values (attempt timestamps).
// assumeToday: treat today as practiced even if its attempt hasn't landed in
// the fetched set yet (used right after a submission).
export function computeStreak(dates, { assumeToday = false, now = new Date() } = {}) {
  const days = new Set();
  for (const value of dates || []) {
    const key = localDateKey(value);
    if (key) days.add(key);
  }
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (assumeToday) days.add(localDateKey(cursor));
  const practicedToday = days.has(localDateKey(cursor));
  if (!practicedToday) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streak, practicedToday };
}

export function isStreakMilestone(streak) {
  return STREAK_MILESTONES.includes(streak);
}

// Longest run of consecutive practice days anywhere in the supplied window.
// The dashboard shows it next to the current streak ("best: 12 days"), so a
// broken streak still reads as progress rather than a reset to zero.
export function computeBestStreak(dates, { assumeToday = false, now = new Date() } = {}) {
  const days = new Set();
  for (const value of dates || []) {
    const key = localDateKey(value);
    if (key) days.add(key);
  }
  if (assumeToday) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    days.add(localDateKey(today));
  }
  let best = 0;
  for (const key of days) {
    const [year, month, day] = key.split('-').map(Number);
    const previous = new Date(year, month - 1, day - 1);
    // Only count from the first day of each run, so every run is walked once.
    if (days.has(localDateKey(previous))) continue;
    let run = 0;
    const cursor = new Date(year, month - 1, day);
    while (days.has(localDateKey(cursor))) {
      run += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    if (run > best) best = run;
  }
  return best;
}

// Current streak + personal best in one pass over the same attempt dates.
export function computeStreakStats(dates, options = {}) {
  return {
    ...computeStreak(dates, options),
    bestStreak: computeBestStreak(dates, options),
  };
}
