// src/lib/streak.js
// Shared practice-streak logic: one source of truth for the dashboard, the
// post-submit results summary, and the navbar badge. A "practice day" is any
// local calendar day with at least one attempt; the streak counts consecutive
// days ending today (or yesterday, so an unbroken run isn't shown as 0 before
// today's practice happens). Everything is computed from real stored attempts.

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

export function localDateKey(value) {
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
