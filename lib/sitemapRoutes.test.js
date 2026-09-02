import { describe, expect, it } from 'vitest';
import { STATIC_ROUTES } from '../pages/sitemap.xml';
import { SPEAKING_FAMILY_SLUGS } from './speakingTopicFamilies';

describe('sitemap static-route inventory', () => {
  it('includes every indexable acquisition and conversion route', () => {
    expect(STATIC_ROUTES).toEqual(
      expect.arrayContaining([
        '/',
        '/pricing',
        '/band-calculator',
        '/band-estimator',
        '/ielts-writing-checker',
        '/speaking-examiner',
        '/mock-test',
      ])
    );
  });

  it('includes every speaking hub route', () => {
    expect(STATIC_ROUTES).toEqual(
      expect.arrayContaining([
        '/speaking/part-1',
        '/speaking/part-2',
        '/speaking/part-3',
        '/speaking/new-cue-cards',
        '/speaking/topics/people',
        '/speaking/topics/future-plans',
      ])
    );
    // one hub per topic family, and nothing but the family hubs under /topics/
    const familyRoutes = STATIC_ROUTES.filter((route) => route.startsWith('/speaking/topics/'));
    expect(familyRoutes).toHaveLength(SPEAKING_FAMILY_SLUGS.length);
    expect(familyRoutes).toEqual(SPEAKING_FAMILY_SLUGS.map((slug) => `/speaking/topics/${slug}`));
  });

  it('contains no duplicate or private/system routes', () => {
    expect(new Set(STATIC_ROUTES).size).toBe(STATIC_ROUTES.length);
    expect(STATIC_ROUTES).not.toEqual(
      expect.arrayContaining([
        '/auth/callback',
        '/billing/manage',
        '/dashboard',
        '/404',
        '/500',
      ])
    );
  });
});
