import { describe, expect, it } from 'vitest';
import {
  getListeningPartSeo,
  LISTENING_PARTS,
  LISTENING_PART_FAQS,
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

  it('gives every part hub an above-the-fold answer capsule', () => {
    for (const slug of LISTENING_PART_SLUGS) {
      const { guide } = LISTENING_PARTS[slug];
      expect(guide.answer.length).toBeGreaterThan(120);
      expect(guide.steps.length).toBeGreaterThanOrEqual(4);
      expect(guide.traps.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('gives every part hub 3 question-phrased FAQs', () => {
    expect(Object.keys(LISTENING_PART_FAQS)).toEqual(LISTENING_PART_SLUGS);
    for (const slug of LISTENING_PART_SLUGS) {
      const faqs = LISTENING_PART_FAQS[slug];
      expect(faqs.length).toBeGreaterThanOrEqual(3);
      faqs.forEach((faq) => {
        expect(faq.q.endsWith('?')).toBe(true);
        expect(faq.a.length).toBeGreaterThan(60);
      });
    }
  });

  it('returns null for an unknown hub slug', () => {
    expect(getListeningPartSeo('part-5')).toBeNull();
  });
});
