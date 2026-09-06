import { describe, expect, it } from 'vitest';
import {
  getReadingTypeSeo,
  READING_QUESTION_TYPE_SLUGS,
  availableReadingTypeLinks,
} from './readingQuestionTypes';

describe('Reading question-type share metadata', () => {
  it('offers only categories represented in the published reading items', () => {
    const items = [
      { questionTypes: ['true_false_notgiven', 'diagram_label'] },
      { questionTypes: ['diagram_label', 'unknown_type'] },
      {},
    ];
    const links = availableReadingTypeLinks(items);
    expect(links.map(({ questionType }) => questionType)).toEqual([
      'true_false_notgiven', 'diagram_label',
    ]);
    expect(links.some(({ slug }) => slug === 'plan-map-diagram-labelling')).toBe(false);
    expect(availableReadingTypeLinks([])).toEqual([]);
    expect(availableReadingTypeLinks([{ questionTypes: ['plan_map_diagram_label'] }]))
      .toEqual([expect.objectContaining({ slug: 'plan-map-diagram-labelling' })]);
  });

  it('provides a complete, unique social card contract for all 16 hubs', () => {
    const rows = READING_QUESTION_TYPE_SLUGS.map((slug) => ({
      slug,
      seo: getReadingTypeSeo(slug),
    }));

    expect(rows).toHaveLength(16);
    expect(new Set(rows.map(({ seo }) => seo.title)).size).toBe(16);
    expect(new Set(rows.map(({ seo }) => seo.canonical)).size).toBe(16);
    expect(new Set(rows.map(({ seo }) => seo.ogImage)).size).toBe(16);

    for (const { slug, seo } of rows) {
      expect(seo.title).toContain('IELTS');
      expect(seo.description.length).toBeGreaterThan(70);
      expect(seo.canonical).toBe(`https://www.ielts-bank.com/reading/${slug}`);
      expect(seo.ogImage).toContain('/api/og?title=');
      expect(seo.ogImage).toContain('&type=reading&subtitle=');
      expect(seo.imageAlt).toContain('IELTS-Bank');
    }
  });

  it('returns null for an unknown hub slug', () => {
    expect(getReadingTypeSeo('unknown-question-type')).toBeNull();
  });
});
