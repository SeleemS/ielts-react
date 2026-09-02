import { describe, expect, it } from 'vitest';
import { SPEAKING_PARTS, SPEAKING_PART_SLUGS, getSpeakingPartSeo } from './speakingParts';

describe('Speaking part hub metadata', () => {
  it('provides a complete, unique social card contract for all 3 part hubs', () => {
    const rows = SPEAKING_PART_SLUGS.map((slug) => ({ slug, seo: getSpeakingPartSeo(slug) }));

    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(({ seo }) => seo.title)).size).toBe(3);
    expect(new Set(rows.map(({ seo }) => seo.canonical)).size).toBe(3);
    expect(new Set(rows.map(({ seo }) => seo.ogImage)).size).toBe(3);

    for (const { slug, seo } of rows) {
      expect(seo.title).toContain('IELTS');
      // Google truncates past ~70 characters.
      expect(seo.title.length).toBeLessThanOrEqual(70);
      expect(seo.description.length).toBeGreaterThan(70);
      expect(seo.description.length).toBeLessThanOrEqual(200);
      expect(seo.canonical).toBe(`https://www.ielts-bank.com/speaking/${slug}`);
      expect(seo.ogImage).toContain('/api/og?title=');
      expect(seo.ogImage).toContain('&type=speaking&subtitle=');
      expect(seo.imageAlt).toContain('IELTS-Bank');
    }
  });

  it('maps each hub slug to its speaking_details.part value', () => {
    expect(SPEAKING_PART_SLUGS.map((slug) => SPEAKING_PARTS[slug].part)).toEqual([1, 2, 3]);
  });

  it('gives every part an above-the-fold answer capsule and a full guide', () => {
    for (const slug of SPEAKING_PART_SLUGS) {
      const { guide } = SPEAKING_PARTS[slug];
      expect(guide.answer.length).toBeGreaterThan(150);
      expect(guide.intro.length).toBeGreaterThan(150);
      expect(guide.tests.length).toBeGreaterThan(100);
      expect(guide.timing.length).toBeGreaterThan(80);
      expect(guide.listeningFor.length).toBeGreaterThanOrEqual(3);
      expect(guide.steps.length).toBeGreaterThanOrEqual(4);
      expect(guide.traps.length).toBeGreaterThanOrEqual(4);
      expect(guide.faqs.length).toBeGreaterThanOrEqual(3);
      guide.faqs.forEach((faq) => {
        expect(faq.q.endsWith('?')).toBe(true);
        expect(faq.a.length).toBeGreaterThan(40);
      });
    }
  });

  it('never claims official or past-paper provenance', () => {
    const corpus = JSON.stringify(SPEAKING_PARTS).toLowerCase();
    for (const banned of ['past paper', 'real test question', 'actual exam question', 'official ielts']) {
      expect(corpus).not.toContain(banned);
    }
  });

  it('returns null for an unknown hub slug', () => {
    expect(getSpeakingPartSeo('part-4')).toBeNull();
  });
});
