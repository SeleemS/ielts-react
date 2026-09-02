import { describe, expect, it } from 'vitest';
import {
  SPEAKING_TOPIC_FAMILIES,
  SPEAKING_FAMILY_SLUGS,
  SPEAKING_FAMILY_LINKS,
  getSpeakingFamilySeo,
  classifySpeakingFamily,
} from './speakingTopicFamilies';

describe('Speaking topic family hubs', () => {
  it('covers the official topic areas with a unique SEO contract each', () => {
    expect(SPEAKING_FAMILY_SLUGS.length).toBeGreaterThanOrEqual(16);
    const rows = SPEAKING_FAMILY_SLUGS.map((slug) => getSpeakingFamilySeo(slug));
    expect(new Set(rows.map((r) => r.title)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.canonical)).size).toBe(rows.length);

    rows.forEach((seo, i) => {
      const slug = SPEAKING_FAMILY_SLUGS[i];
      expect(seo.title.length).toBeLessThanOrEqual(70);
      expect(seo.title).toContain('IELTS');
      expect(seo.description.length).toBeGreaterThan(70);
      expect(seo.canonical).toBe(`https://www.ielts-bank.com/speaking/topics/${slug}`);
      expect(seo.ogImage).toContain('&type=speaking&subtitle=');
      expect(seo.imageAlt).toContain('IELTS-Bank');
    });
  });

  it('gives every family a label, H1 and blurb', () => {
    for (const slug of SPEAKING_FAMILY_SLUGS) {
      const family = SPEAKING_TOPIC_FAMILIES[slug];
      expect(family.slug).toBe(slug);
      expect(family.label.length).toBeGreaterThan(2);
      expect(family.h1).toContain('IELTS Speaking Cue Cards');
      expect(family.blurb.length).toBeGreaterThan(60);
      expect(family.keywords.length).toBeGreaterThan(3);
    }
    expect(SPEAKING_FAMILY_LINKS).toHaveLength(SPEAKING_FAMILY_SLUGS.length);
  });

  it('returns null for an unknown family', () => {
    expect(getSpeakingFamilySeo('sports')).toBeNull();
  });
});

describe('classifySpeakingFamily', () => {
  it('prefers an explicit family tag (batch-generated cards)', () => {
    expect(
      classifySpeakingFamily({ title: 'Anything at all', topicTags: ['technology', 'cue-card', 'part2'] })
    ).toBe('technology');
  });

  it('maps legacy alias tags onto a family', () => {
    expect(
      classifySpeakingFamily({
        title: 'IELTS Speaking Cue Card: Describe a Memorable Celebration You Attended',
        topicTags: ['events', 'celebrations', 'memories'],
      })
    ).toBe('events');
    expect(
      classifySpeakingFamily({
        title: 'IELTS Speaking Part 1: Friends Questions',
        topicTags: ['friends', 'relationships', 'part1'],
      })
    ).toBe('people');
  });

  it('falls back to keywords in the title when no tag matches', () => {
    expect(
      classifySpeakingFamily({
        title: 'IELTS Speaking Cue Card: Describe a Dish You Really Like',
        topicTags: ['tastes'],
      })
    ).toBe('food');
    expect(
      classifySpeakingFamily({ title: 'Describe a trip you took by train', topicTags: [] })
    ).toBe('travel');
  });

  it('classifies every legacy (pre-family-tag) speaking item onto a hub', () => {
    // Representative sample of the 80 hand-authored items already published:
    // [title, tags, expected family].
    const legacy = [
      ['IELTS Speaking Part 1: Home and Hometown Questions', ['home', 'hometown', 'part1'], 'places'],
      ['IELTS Speaking Part 1: Colours Questions', ['colours', 'preferences', 'part1'], 'objects'],
      ['IELTS Speaking Part 1: Learning Languages Questions', ['languages', 'learning', 'part1'], 'culture'],
      ['IELTS Speaking Part 1: Sleep Questions', ['sleep', 'health', 'part1'], 'health'],
      ['IELTS Speaking Part 1: Public Transport Questions', ['public-transport', 'travel', 'part1'], 'travel'],
      ['IELTS Speaking Part 3: Ambition and Success Discussion', ['ambition', 'success', 'part3'], 'future-plans'],
      ['IELTS Speaking Part 3: Heritage and Cities Discussion', ['heritage', 'cities', 'part3'], 'places'],
      ['IELTS Speaking Part 3: Consumer Culture Discussion', ['consumerism', 'shopping', 'part3'], 'money'],
      ['IELTS Speaking Cue Card: Describe a Memorable Journey You Took', ['travel', 'journey', 'memories'], 'travel'],
      ['IELTS Speaking Cue Card: Describe a Good Leader', ['people', 'leadership', 'qualities'], 'people'],
    ];
    for (const [title, topicTags, expected] of legacy) {
      expect(classifySpeakingFamily({ title, topicTags }), title).toBe(expected);
    }
  });

  it('does not match a keyword inside another word ("art" in "Part 1")', () => {
    // Regression: "IELTS Speaking Part 1: …" used to land everything in objects.
    expect(classifySpeakingFamily({ title: 'IELTS Speaking Part 1: Weather and Seasons Questions', topicTags: [] })).toBe(
      'nature'
    );
  });

  it('returns null when nothing matches at all', () => {
    expect(classifySpeakingFamily({ title: 'zzzz', topic: '', topicTags: [] })).toBeNull();
    expect(classifySpeakingFamily()).toBeNull();
  });
});
