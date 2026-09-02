// Reminder-hour matching across time zones and DST boundaries, and the
// one-per-local-day guarantee.
import { describe, expect, it } from 'vitest';
import {
  dueReminders,
  localClock,
  reminderDue,
  reminderNotification,
} from '../lib/pushSchedule';

const base = (overrides = {}) => ({
  id: 'sub-1',
  enabled: true,
  failures: 0,
  reminder_hour_local: 19,
  time_zone: 'Asia/Karachi', // UTC+5, no DST
  tz_offset_minutes: 300,
  last_sent_at: null,
  ...overrides,
});

describe('localClock', () => {
  it('resolves the local hour from the IANA zone', () => {
    // 14:00 UTC is 19:00 in Karachi (UTC+5).
    expect(localClock(base(), new Date('2026-09-02T14:00:00Z'))).toEqual({
      hour: 19,
      dateKey: '2026-09-02',
    });
  });

  it('rolls the local date forward across midnight', () => {
    expect(localClock(base({ time_zone: 'Asia/Tokyo' }), new Date('2026-09-02T16:00:00Z'))).toEqual({
      hour: 1,
      dateKey: '2026-09-03',
    });
  });

  it('falls back to the stored offset when the zone is missing or bogus', () => {
    expect(
      localClock(
        { time_zone: null, tz_offset_minutes: -330 },
        new Date('2026-09-02T14:00:00Z')
      )
    ).toEqual({ hour: 8, dateKey: '2026-09-02' });
    expect(
      localClock(
        { time_zone: 'Not/AZone', tz_offset_minutes: 60 },
        new Date('2026-09-02T23:30:00Z')
      )
    ).toEqual({ hour: 0, dateKey: '2026-09-03' });
  });
});

describe('reminderDue across time zones', () => {
  it('fires on the single UTC hour that matches each learner’s 7pm', () => {
    const karachi = base();
    const london = base({ id: 'sub-2', time_zone: 'Europe/London', tz_offset_minutes: 60 });
    const now = new Date('2026-09-02T14:00:00Z');

    expect(reminderDue(karachi, now).due).toBe(true); // 19:00 PKT
    expect(reminderDue(london, now).due).toBe(false); // 15:00 BST
    expect(reminderDue(london, new Date('2026-09-02T18:00:00Z')).due).toBe(true);
  });

  it('tracks DST: the same 7pm reminder moves by an hour in UTC', () => {
    const newYork = base({ time_zone: 'America/New_York', tz_offset_minutes: -240 });

    // Summer (EDT, UTC-4): 19:00 local is 23:00 UTC.
    expect(reminderDue(newYork, new Date('2026-07-15T23:00:00Z')).due).toBe(true);
    expect(reminderDue(newYork, new Date('2026-07-16T00:00:00Z')).due).toBe(false);

    // Winter (EST, UTC-5): 19:00 local is 00:00 UTC the next day — and the
    // stale summer offset stored on the row must NOT be what decides it.
    expect(reminderDue(newYork, new Date('2026-12-16T00:00:00Z')).due).toBe(true);
    expect(reminderDue(newYork, new Date('2026-12-15T23:00:00Z')).due).toBe(false);
  });

  it('still fires exactly once on a spring-forward day', () => {
    // 2026-03-08 is the US spring-forward date; 02:00 local does not exist.
    const newYork = base({ time_zone: 'America/New_York', reminder_hour_local: 2 });
    const hours = Array.from({ length: 24 }, (_, hour) =>
      reminderDue(newYork, new Date(Date.UTC(2026, 2, 8, hour))).due
    );
    expect(hours.filter(Boolean)).toHaveLength(0); // the hour is skipped, no send

    // ...and on the fall-back day the duplicated hour still sends only once,
    // because last_sent_at lands on the same local date.
    const fall = base({ time_zone: 'America/New_York', reminder_hour_local: 1 });
    const first = new Date('2026-11-01T05:00:00Z'); // 01:00 EDT
    expect(reminderDue(fall, first).due).toBe(true);
    const after = { ...fall, last_sent_at: first.toISOString() };
    expect(reminderDue(after, new Date('2026-11-01T06:00:00Z')).due).toBe(false); // 01:00 EST
  });

  it('sends at most one notification per local calendar day', () => {
    const sent = base({ last_sent_at: '2026-09-02T14:00:05Z' });
    expect(reminderDue(sent, new Date('2026-09-02T14:30:00Z')).reason).toBe('already-sent-today');
    expect(reminderDue(sent, new Date('2026-09-03T14:00:00Z')).due).toBe(true);
  });

  it('skips disabled, exhausted, and malformed rows', () => {
    const now = new Date('2026-09-02T14:00:00Z');
    expect(reminderDue(base({ enabled: false }), now).reason).toBe('disabled');
    expect(reminderDue(base({ failures: 5 }), now).reason).toBe('too-many-failures');
    expect(reminderDue(base({ reminder_hour_local: 99 }), now).reason).toBe('bad-reminder-hour');
    expect(reminderDue(base(), new Date('nonsense')).reason).toBe('bad-clock');
  });

  it('filters a mixed batch down to the due rows', () => {
    const now = new Date('2026-09-02T14:00:00Z');
    const rows = [
      base({ id: 'due' }),
      base({ id: 'other-hour', reminder_hour_local: 8 }),
      base({ id: 'off', enabled: false }),
      base({ id: 'sent', last_sent_at: '2026-09-02T13:00:00Z' }),
    ];
    expect(dueReminders(rows, now).map((row) => row.id)).toEqual(['due']);
  });
});

describe('reminderNotification', () => {
  it('leads with the streak and links into the review pool', () => {
    const copy = reminderNotification({ streak: 6, reviewCount: 4 });
    expect(copy.title).toBe('Your daily IELTS question is ready · 🔥 6-day streak');
    expect(copy.body).toContain('keep your 6-day streak');
    expect(copy.body).toContain('4 questions');
    expect(copy.url).toBe('/review?src=push');
  });

  it('falls back to the skill index when the review pool is empty', () => {
    const copy = reminderNotification({ streak: 2, reviewCount: 0 });
    expect(copy.url).toBe('/readingquestion?src=push');
    expect(copy.body).toContain('2-day streak');
  });

  it('drops the streak clause at zero', () => {
    const copy = reminderNotification({ streak: 0, reviewCount: 0 });
    expect(copy.title).toBe('Your daily IELTS question is ready');
    expect(copy.body).toContain('starts your streak');
  });
});
