import { describe, expect, it } from 'vitest';
import {
  getReadingTypeSeo,
  READING_QUESTION_TYPE_SLUGS,
} from './readingQuestionTypes';

describe('Reading question-type share metadata', () => {
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
