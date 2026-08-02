// computeStreak: consecutive local practice days ending today (or yesterday,
// so an unbroken run isn't reported as 0 before today's practice).
import { describe, expect, it } from 'vitest';
import { computeStreak, isStreakMilestone, localDateKey } from '../src/lib/streak';

const NOW = new Date('2026-08-02T15:00:00');
const day = (offset, hour = 10) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('computeStreak', () => {
  it('returns 0 with no practice days', () => {
    expect(computeStreak([], { now: NOW })).toEqual({ streak: 0, practicedToday: false });
  });

  it('counts consecutive days ending today', () => {
    const result = computeStreak([day(0), day(1), day(2)], { now: NOW });
    expect(result).toEqual({ streak: 3, practicedToday: true });
  });

  it('keeps the streak alive when today has no practice yet', () => {
    const result = computeStreak([day(1), day(2)], { now: NOW });
    expect(result).toEqual({ streak: 2, practicedToday: false });
  });

  it('breaks on a gap', () => {
    const result = computeStreak([day(0), day(2), day(3)], { now: NOW });
    expect(result).toEqual({ streak: 1, practicedToday: true });
  });

  it('assumeToday counts an unrecorded submission as today', () => {
    expect(computeStreak([], { assumeToday: true, now: NOW })).toEqual({
      streak: 1,
      practicedToday: true,
    });
    // Yesterday's practice plus the just-made submission = 2.
    expect(computeStreak([day(1)], { assumeToday: true, now: NOW }).streak).toBe(2);
  });

  it('dedupes multiple attempts on the same day', () => {
    expect(computeStreak([day(0, 9), day(0, 20)], { now: NOW }).streak).toBe(1);
  });

  it('ignores invalid dates', () => {
    expect(computeStreak(['garbage', null, day(0)], { now: NOW }).streak).toBe(1);
  });
});

describe('helpers', () => {
  it('localDateKey uses local calendar days', () => {
    expect(localDateKey(new Date('2026-08-02T00:30:00'))).toBe('2026-08-02');
    expect(localDateKey('not a date')).toBe(null);
  });

  it('milestones', () => {
    expect(isStreakMilestone(3)).toBe(true);
    expect(isStreakMilestone(4)).toBe(false);
    expect(isStreakMilestone(30)).toBe(true);
  });
});
