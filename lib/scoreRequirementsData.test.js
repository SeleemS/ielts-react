import { describe, expect, it } from 'vitest';
import {
  SCORE_REQUIREMENT_COUNTRIES,
  SCORE_REQUIREMENT_COUNTRY_SLUGS,
  getScoreRequirementCountry,
} from './scoreRequirementsData';
import { countryScoreRequirementsSeo } from './scoreRequirementsSeo';

// These pages quote other organisations' requirements. The whole page is only
// defensible because every figure is attributed to the body that publishes it,
// so "has a source" is not a nice-to-have here — it is the publishing rule, and
// these tests are what stop an unsourced row reaching production.

// Content-aggregator and study-agency domains are exactly what we must not cite:
// they restate requirements second-hand and go stale silently.
const BANNED_HOSTS = [
  'shiksha.com',
  'yocket.com',
  'leverageedu.com',
  'idp.com',
  'studyabroad.com',
  'wikipedia.org',
  'quora.com',
  'reddit.com',
];

const everyRow = SCORE_REQUIREMENT_COUNTRIES.flatMap((country) => [
  ...country.purposes.map((row) => ({ country, kind: 'purpose', label: row.purpose, row })),
  ...country.universities.map((row) => ({ country, kind: 'university', label: row.name, row })),
]);

describe('score requirement country data', () => {
  it('covers the ten destinations the routes promise', () => {
    expect(SCORE_REQUIREMENT_COUNTRY_SLUGS).toEqual([
      'united-kingdom',
      'canada',
      'australia',
      'united-states',
      'new-zealand',
      'ireland',
      'germany',
      'netherlands',
      'united-arab-emirates',
      'singapore',
    ]);
    expect(new Set(SCORE_REQUIREMENT_COUNTRY_SLUGS).size).toBe(
      SCORE_REQUIREMENT_COUNTRY_SLUGS.length
    );
  });

  it('resolves a country by slug and returns null otherwise', () => {
    expect(getScoreRequirementCountry('canada').shortName).toBeTruthy();
    expect(getScoreRequirementCountry('atlantis')).toBeNull();
  });

  it.each(SCORE_REQUIREMENT_COUNTRIES.map((c) => c.slug))('%s is complete', (slug) => {
    const country = getScoreRequirementCountry(slug);
    expect(country.name.trim()).not.toBe('');
    expect(country.shortName.trim()).not.toBe('');
    expect(country.purposes.length).toBeGreaterThanOrEqual(3);
    expect(country.faq.length).toBeGreaterThanOrEqual(3);
    // The Quick answer capsule is what an assistant is most likely to quote.
    expect(country.answer.length).toBeGreaterThan(150);
    expect(country.answer).not.toMatch(/[<>]/);
    expect(Number.isNaN(new Date(country.verifiedOn).getTime())).toBe(false);
  });
});

describe('every published figure is attributed', () => {
  it.each(everyRow.map((entry) => [`${entry.country.slug} / ${entry.kind} / ${entry.label}`, entry]))(
    '%s cites at least one source',
    (_name, entry) => {
      expect(Array.isArray(entry.row.sources)).toBe(true);
      expect(entry.row.sources.length).toBeGreaterThanOrEqual(1);
      entry.row.sources.forEach((source) => {
        expect(source.label.trim()).not.toBe('');
        const url = new URL(source.url);
        expect(url.protocol).toBe('https:');
        BANNED_HOSTS.forEach((host) =>
          expect(url.hostname.endsWith(host), `${source.url} is an aggregator`).toBe(false)
        );
      });
    }
  );

  it('states a band and a note on every row', () => {
    SCORE_REQUIREMENT_COUNTRIES.forEach((country) => {
      country.purposes.forEach((row) => {
        expect(row.band.trim(), `${country.slug}/${row.purpose}`).not.toBe('');
        expect(row.notes.trim(), `${country.slug}/${row.purpose}`).not.toBe('');
      });
      country.universities.forEach((row) => {
        expect(row.undergrad.trim(), `${country.slug}/${row.name}`).not.toBe('');
        expect(row.postgrad.trim(), `${country.slug}/${row.name}`).not.toBe('');
      });
    });
  });

  it('hedges third-party requirements rather than stating them as permanent', () => {
    // Every country page must carry the "this can change, check the source"
    // caveat somewhere in its own words, not only in shared page furniture.
    SCORE_REQUIREMENT_COUNTRIES.forEach((country) => {
      const prose = [country.answer, ...country.faq.map((f) => f.a)].join(' ').toLowerCase();
      expect(
        /typically|commonly|usually|verify|confirm|check |varies|can change/.test(prose),
        `${country.slug} states requirements without hedging`
      ).toBe(true);
    });
  });

  it('never claims IELTS affiliation or promises a band', () => {
    SCORE_REQUIREMENT_COUNTRIES.forEach((country) => {
      const prose = [country.answer, ...country.faq.map((f) => `${f.q} ${f.a}`)].join(' ');
      expect(prose, country.slug).not.toMatch(/past papers?/i);
      expect(prose, country.slug).not.toMatch(/guarantee/i);
      expect(prose, country.slug).not.toMatch(/official partner|in partnership with IELTS/i);
    });
  });
});

describe('country page SEO', () => {
  it.each(SCORE_REQUIREMENT_COUNTRIES.map((c) => [c.slug, c]))(
    '%s keeps the title inside the 70-character budget',
    (_slug, country) => {
      const seo = countryScoreRequirementsSeo(country);
      expect(seo.title.length).toBeLessThanOrEqual(70);
      expect(seo.description.length).toBeGreaterThan(80);
      expect(seo.canonical).toBe(
        `https://www.ielts-bank.com/ielts-score-requirements/${country.slug}`
      );
      expect(new URL(seo.ogImage).pathname).toBe('/api/og');
    }
  );
});
