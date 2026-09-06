import { describe, expect, it } from 'vitest';
import {
  buildMonthlyRoundup,
  isPublishableMonth,
  listRoundupMonths,
  listAvailableRoundupMonths,
  monthSlugFor,
  parseMonthSlug,
  MIN_PROMPTS_PER_MONTH,
} from './task2Roundup';
import { classifyTask2Frame, TASK2_FRAMES, TASK2_FRAME_IDS } from './task2Frames';
import { TASK2_PROMPTS } from './task2Prompts';
import { monthlyTask2Seo } from './task2TopicsSeo';

const NOW = new Date('2026-09-02T00:00:00Z');

function prompt(slug, added, frame = 'opinion', updated = added) {
  return { slug, title: slug, module: 'academic', frame, tags: [], added, updated };
}

describe('month slugs', () => {
  it('round-trips a slug through parse and format', () => {
    expect(monthSlugFor(NOW)).toBe('september-2026');
    expect(parseMonthSlug('september-2026')).toMatchObject({
      label: 'September 2026',
      isoMonth: '2026-09',
      year: 2026,
      monthIndex: 8,
    });
  });

  it('rejects anything that is not a real month', () => {
    ['banana-2026', 'september', '2026-09', 'september-99', 'sept-2026', ''].forEach((slug) =>
      expect(parseMonthSlug(slug)).toBeNull()
    );
  });

  it('never publishes a month that has not happened yet', () => {
    expect(isPublishableMonth('september-2026', NOW)).toBe(true);
    expect(isPublishableMonth('august-2026', NOW)).toBe(true);
    expect(isPublishableMonth('october-2026', NOW)).toBe(false);
    expect(isPublishableMonth('january-2027', NOW)).toBe(false);
  });

  it('lists the trailing months newest first', () => {
    expect(listRoundupMonths(NOW, 4)).toEqual([
      'september-2026',
      'august-2026',
      'july-2026',
      'june-2026',
    ]);
  });

  it('walks back across a year boundary', () => {
    expect(listRoundupMonths(new Date('2027-01-15T00:00:00Z'), 3)).toEqual([
      'january-2027',
      'december-2026',
      'november-2026',
    ]);
  });

  it('does not advertise months before usable content exists', () => {
    const prompts = [prompt('first', '2026-07-04')];
    expect(listAvailableRoundupMonths(prompts, NOW, 6)).toEqual([
      'september-2026', 'august-2026', 'july-2026',
    ]);
    expect(listAvailableRoundupMonths([], NOW, 6)).toEqual([]);
    expect(listAvailableRoundupMonths([prompt('future', '2026-10-01')], NOW, 6)).toEqual([]);
    for (const slug of listAvailableRoundupMonths(TASK2_PROMPTS, NOW, 6)) {
      expect(buildMonthlyRoundup(TASK2_PROMPTS, slug, { now: NOW }).groups.length).toBeGreaterThan(0);
    }
  });
});

describe('monthly roundup', () => {
  it('labels a month whose prompts were all added that month as new', () => {
    const prompts = Array.from({ length: 14 }, (_, i) =>
      prompt(`new-${i}`, '2026-09-10', TASK2_FRAME_IDS[i % TASK2_FRAME_IDS.length])
    );
    const roundup = buildMonthlyRoundup(prompts, 'september-2026', { now: NOW });

    expect(roundup.source).toBe('new');
    expect(roundup.addedThisMonthCount).toBe(14);
    expect(roundup.groups.every((g) => g.prompts.every((p) => p.isNew))).toBe(true);
  });

  it('falls back to recent prompts — never a blank page — when nothing was added', () => {
    const prompts = Array.from({ length: 20 }, (_, i) => prompt(`old-${i}`, '2026-07-04'));
    const roundup = buildMonthlyRoundup(prompts, 'september-2026', { now: NOW });

    expect(roundup.source).toBe('recent');
    expect(roundup.addedThisMonthCount).toBe(0);
    expect(roundup.totalCount).toBe(MIN_PROMPTS_PER_MONTH);
    // Nothing may be badged "New" when nothing is new.
    expect(roundup.groups.flatMap((g) => g.prompts).some((p) => p.isNew)).toBe(false);
  });

  it('tops a thin month up with older prompts and marks only the real arrivals', () => {
    const prompts = [
      ...Array.from({ length: 3 }, (_, i) => prompt(`sep-${i}`, '2026-09-01')),
      ...Array.from({ length: 20 }, (_, i) => prompt(`jul-${i}`, '2026-07-01')),
    ];
    const roundup = buildMonthlyRoundup(prompts, 'september-2026', { now: NOW });

    expect(roundup.source).toBe('mixed');
    expect(roundup.totalCount).toBe(MIN_PROMPTS_PER_MONTH);
    const items = roundup.groups.flatMap((g) => g.prompts);
    expect(items.filter((p) => p.isNew).map((p) => p.slug).sort()).toEqual([
      'sep-0',
      'sep-1',
      'sep-2',
    ]);
  });

  it('never shows a prompt that did not exist yet in an archived month', () => {
    const prompts = [
      ...Array.from({ length: 20 }, (_, i) => prompt(`future-${i}`, '2026-09-01')),
      prompt('past-1', '2026-06-01'),
    ];
    const roundup = buildMonthlyRoundup(prompts, 'july-2026', { now: NOW });

    expect(roundup.groups.flatMap((g) => g.prompts).map((p) => p.slug)).toEqual(['past-1']);
  });

  it('does not claim a future dateModified for an archived month', () => {
    const roundup = buildMonthlyRoundup(
      [prompt('a', '2026-07-01', 'opinion', '2026-07-20')],
      'july-2026',
      { now: NOW }
    );
    expect(roundup.dateModified).toBe('2026-07-20');
  });

  it('returns null for a slug that is not a month', () => {
    expect(buildMonthlyRoundup([prompt('a', '2026-07-01')], 'not-a-month')).toBeNull();
  });
});

describe('the real prompt catalogue', () => {
  it('is non-empty and every row is complete', () => {
    expect(TASK2_PROMPTS.length).toBeGreaterThan(50);
    TASK2_PROMPTS.forEach((p) => {
      expect(p.slug).toMatch(/^[a-z0-9-]+$/);
      expect(p.title.trim()).not.toBe('');
      expect(TASK2_FRAME_IDS).toContain(p.frame);
      expect(['academic', 'general']).toContain(p.module);
      expect(p.added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('has no duplicate slugs', () => {
    const slugs = TASK2_PROMPTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('renders a usable page for the current month even though no prompts landed in it', () => {
    const roundup = buildMonthlyRoundup(TASK2_PROMPTS, monthSlugFor(NOW), { now: NOW });
    expect(roundup.groups.length).toBeGreaterThan(0);
    expect(roundup.totalCount).toBeGreaterThanOrEqual(MIN_PROMPTS_PER_MONTH);
  });

  it('covers every frame across the whole bank', () => {
    TASK2_FRAME_IDS.forEach((id) => {
      expect(TASK2_PROMPTS.some((p) => p.frame === id)).toBe(true);
    });
  });
});

describe('frame classifier', () => {
  it.each([
    ['Discuss both views and give your own opinion.', 'discussion'],
    ['To what extent do you agree or disagree?', 'opinion'],
    ['Do the advantages of working from home outweigh the disadvantages?', 'advantages-disadvantages'],
    ['What problems does this cause? What measures could reduce it?', 'problem-solution'],
    ['Do you think this is a positive or negative development?', 'positive-negative'],
    ['Why has this happened? Do you think it is a good or bad development?', 'positive-negative'],
    ['Why are so many languages dying out? Should efforts be made to keep them alive?', 'two-part'],
  ])('classifies %s', (text, expected) => {
    expect(classifyTask2Frame(text)).toBe(expected);
  });

  it('is not fooled by the boilerplate that ends almost every prompt', () => {
    const boilerplate =
      ' Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.';
    expect(classifyTask2Frame(`Discuss both views and give your own opinion.${boilerplate}`)).toBe(
      'discussion'
    );
  });

  it('strips markup before matching', () => {
    expect(classifyTask2Frame('<p>Discuss <strong>both views</strong> and give your own opinion.</p>')).toBe(
      'discussion'
    );
  });

  it('falls back to opinion rather than dropping an unrecognised prompt', () => {
    expect(classifyTask2Frame('Some statement with no instruction.')).toBe('opinion');
    expect(TASK2_FRAME_IDS).toHaveLength(TASK2_FRAMES.length);
  });
});

describe('monthly roundup SEO', () => {
  const seo = monthlyTask2Seo(parseMonthSlug('september-2026'), 24);

  it('keeps the title inside the 70-character budget', () => {
    expect(seo.title.length).toBeLessThanOrEqual(70);
    expect(seo.title).toContain('September 2026');
  });

  it('publishes a canonical on the www origin', () => {
    expect(seo.canonical).toBe(
      'https://www.ielts-bank.com/ielts-writing-task-2-topics/september-2026'
    );
  });

  it('encodes the OG parameters safely', () => {
    const url = new URL(seo.ogImage);
    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('title')).toBe('Task 2 Topics — September 2026');
  });

  it('writes a description that fits a search snippet', () => {
    expect(seo.description.length).toBeGreaterThan(80);
    expect(seo.description).toContain('24');
  });
});
