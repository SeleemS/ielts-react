import { describe, expect, it } from 'vitest';
import { monthBucket, groupByMonthAdded, newestCreatedAt } from '../lib/speakingHubs';

const card = (slug, createdAt) => ({ slug, createdAt, title: slug, href: `/speakingquestion/${slug}` });

describe('speaking freshness helpers', () => {
  it('buckets a timestamp into its month', () => {
    expect(monthBucket('2026-09-02T05:57:15.592Z')).toEqual({ key: '2026-09', label: 'September 2026' });
    expect(monthBucket('2026-07-10T15:19:01.245516+00:00')).toEqual({ key: '2026-07', label: 'July 2026' });
  });

  it('degrades gracefully for a missing or unparseable timestamp', () => {
    expect(monthBucket(null)).toEqual({ key: 'unknown', label: 'Earlier' });
    expect(monthBucket('not a date')).toEqual({ key: 'unknown', label: 'Earlier' });
  });

  it('groups cue cards by month added, newest month and newest card first', () => {
    const months = groupByMonthAdded([
      card('july-a', '2026-07-10T10:00:00Z'),
      card('sept-a', '2026-09-01T10:00:00Z'),
      card('sept-b', '2026-09-02T10:00:00Z'),
      card('aug-a', '2026-08-15T10:00:00Z'),
    ]);

    expect(months.map((m) => m.label)).toEqual(['September 2026', 'August 2026', 'July 2026']);
    expect(months[0].items.map((i) => i.slug)).toEqual(['sept-b', 'sept-a']);
    expect(months[0].items).toHaveLength(2);
  });

  it('reports the newest timestamp for a truthful dateModified', () => {
    expect(
      newestCreatedAt([card('a', '2026-07-10T10:00:00Z'), card('b', '2026-09-02T10:00:00Z')])
    ).toBe('2026-09-02T10:00:00Z');
    expect(newestCreatedAt([])).toBeNull();
    expect(newestCreatedAt([card('a', null)])).toBeNull();
  });

  it('never invents a date when there are no items', () => {
    expect(groupByMonthAdded([])).toEqual([]);
  });
});
