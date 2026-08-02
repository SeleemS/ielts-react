import { describe, expect, it } from 'vitest';
import {
  getListeningPartSeo,
  LISTENING_PARTS,
  LISTENING_PART_SLUGS,
} from './listeningQuestionTypes';

describe('Listening part hub metadata', () => {
  it('provides a complete, unique social card contract for all 4 part hubs', () => {
    const rows = LISTENING_PART_SLUGS.map((slug) => ({
      slug,
      seo: getListeningPartSeo(slug),
    }));

    expect(rows).toHaveLength(4);
    expect(new Set(rows.map(({ seo }) => seo.title)).size).toBe(4);
    expect(new Set(rows.map(({ seo }) => seo.canonical)).size).toBe(4);
    expect(new Set(rows.map(({ seo }) => seo.ogImage)).size).toBe(4);

    for (const { slug, seo } of rows) {
      expect(seo.title).toContain('IELTS');
      expect(seo.description.length).toBeGreaterThan(70);
      expect(seo.canonical).toBe(`https://www.ielts-bank.com/listening/${slug}`);
      expect(seo.ogImage).toContain('/api/og?title=');
      expect(seo.ogImage).toContain('&type=listening&subtitle=');
      expect(seo.imageAlt).toContain('IELTS-Bank');
    }
  });

  it('maps each hub slug to its 1-4 listening_details.part value', () => {
    expect(LISTENING_PART_SLUGS.map((slug) => LISTENING_PARTS[slug].part)).toEqual([1, 2, 3, 4]);
  });

  it('returns null for an unknown hub slug', () => {
    expect(getListeningPartSeo('part-5')).toBeNull();
  });
});
