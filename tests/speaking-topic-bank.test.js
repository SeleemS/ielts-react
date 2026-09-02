import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TOPIC_FAMILIES,
  LIMITS,
  BANNED_PHRASES,
  containsBannedPhrase,
  validateTopic,
  validateTopicBank,
  titleCase,
  passageTitleFor,
  passageSlugFor,
  stableSlug,
  titleSimilarity,
  topicToItem,
} from '../scripts/content/speaking/topic-schema.mjs';
import { SPEAKING_FAMILY_SLUGS } from '../lib/speakingTopicFamilies';

const topics = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/content/speaking/topics.json'), 'utf8')
);

const MIN_TOPICS = 250;
const MIN_PER_FAMILY = 8;

describe('speaking cue-card topic bank', () => {
  it(`ships at least ${MIN_TOPICS} authored cue-card topics`, () => {
    expect(Array.isArray(topics)).toBe(true);
    expect(topics.length).toBeGreaterThanOrEqual(MIN_TOPICS);
  });

  it('has unique topic slugs and unique cue-card titles', () => {
    const slugs = topics.map((t) => t.slug);
    const titles = topics.map((t) => t.title.toLowerCase());
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it(`covers every topic family with at least ${MIN_PER_FAMILY} cards`, () => {
    const counts = Object.fromEntries(TOPIC_FAMILIES.map((f) => [f, 0]));
    for (const topic of topics) counts[topic.family] += 1;
    for (const family of TOPIC_FAMILIES) {
      expect(counts[family], `family ${family}`).toBeGreaterThanOrEqual(MIN_PER_FAMILY);
    }
  });

  it('passes the full bank validator with no errors or internal near-duplicates', () => {
    const { errors, nearDuplicates } = validateTopicBank(topics);
    expect(errors).toEqual([]);
    expect(nearDuplicates.filter((d) => !d.existing)).toEqual([]);
  });

  it('produces unique, stable passage slugs for every topic', () => {
    const slugs = topics.map((topic) => passageSlugFor(topic));
    expect(new Set(slugs).size).toBe(slugs.length);
    // Stable across runs: the slug is a pure function of the title.
    expect(passageSlugFor(topics[0])).toBe(passageSlugFor(topics[0]));
    expect(slugs.every((slug) => /^[a-z0-9-]+$/.test(slug))).toBe(true);
  });

  it('keeps every card inside the authored word limits', () => {
    const wordCount = (s) => String(s).trim().split(/\s+/).length;
    for (const topic of topics) {
      expect(wordCount(topic.title), topic.slug).toBeLessThanOrEqual(LIMITS.titleWords);
      expect(topic.bullets.length).toBeGreaterThanOrEqual(LIMITS.bulletsMin);
      expect(topic.bullets.length).toBeLessThanOrEqual(LIMITS.bulletsMax);
      expect(topic.part1).toHaveLength(LIMITS.part1Count);
      expect(topic.part3).toHaveLength(LIMITS.part3Count);
    }
  });

  it('never claims official or reproduced exam provenance', () => {
    for (const topic of topics) {
      const corpus = [topic.title, topic.explain, ...topic.bullets, ...topic.part1, ...topic.part3].join(' ');
      expect(containsBannedPhrase(corpus), topic.slug).toBeNull();
    }
    // sanity: the checker actually fires
    expect(containsBannedPhrase('from a real IELTS past paper')).toBe('past paper');
    expect(BANNED_PHRASES).toContain('official ielts');
  });

  it('keeps the generator families in sync with the hub families', () => {
    expect(SPEAKING_FAMILY_SLUGS).toEqual(TOPIC_FAMILIES);
  });
});

describe('topic validation', () => {
  const good = {
    slug: 'a-good-topic',
    family: 'people',
    difficulty: 'easy',
    title: 'Describe a person you often see',
    bullets: ['who this person is', 'where you see them', 'what they do'],
    explain: 'and explain why you remember them.',
    part1: ['Do you meet many people?', 'Do you like meeting people?', 'Who do you see daily?'],
    part3: ['Why do people form habits?', 'How do cities change friendships?', 'Should we talk more?', 'Do routines help?'],
  };

  it('accepts a well-formed topic', () => {
    expect(validateTopic(good)).toEqual([]);
  });

  it('rejects a bad family, difficulty and title', () => {
    const errors = validateTopic({ ...good, family: 'sports', difficulty: 'brutal', title: 'A person' });
    expect(errors.join(' ')).toContain('is not a known family');
    expect(errors.join(' ')).toContain('difficulty');
    expect(errors.join(' ')).toContain('must start with "Describe "');
  });

  it('rejects the wrong number of linked questions', () => {
    expect(validateTopic({ ...good, part1: ['Only one?'] }).join(' ')).toContain('Part 1 questions');
    expect(validateTopic({ ...good, part3: [] }).join(' ')).toContain('Part 3 questions');
  });

  it('rejects banned provenance claims anywhere in the card', () => {
    const errors = validateTopic({ ...good, explain: 'and explain this past paper answer.' });
    expect(errors.join(' ')).toContain('banned phrase');
  });

  it('flags duplicate slugs and near-duplicate titles across the bank', () => {
    const { errors, nearDuplicates } = validateTopicBank([
      good,
      { ...good, title: 'Describe a person you see often' },
    ]);
    expect(errors.join(' ')).toContain('duplicate slug');
    expect(nearDuplicates.length).toBeGreaterThan(0);
  });

  it('detects near-duplicates of titles already published', () => {
    const { nearDuplicates } = validateTopicBank([good], {
      existingTitles: ['Describe a Person You Often See'],
    });
    expect(nearDuplicates.some((d) => d.existing)).toBe(true);
    expect(titleSimilarity('Describe a hobby you enjoy', 'Describe a hobby you enjoy')).toBe(1);
    expect(titleSimilarity('Describe a beach you visited', 'Describe a job interview')).toBeLessThan(0.3);
  });
});

describe('slug and title helpers', () => {
  it('title-cases the way the existing bank is titled', () => {
    expect(titleCase('describe a book that influenced you')).toBe('Describe a Book That Influenced You');
    expect(titleCase('describe a friend who is very different from you')).toBe(
      'Describe a Friend Who Is Very Different from You'
    );
  });

  it('builds the DB title and reproduces the original importer slug', () => {
    const topic = { title: 'Describe a book that has influenced you' };
    expect(passageTitleFor(topic)).toBe('IELTS Speaking Cue Card: Describe a Book That Has Influenced You');
    // stableSlug is the algorithm the first 80 items were imported with.
    const title = 'IELTS Speaking Cue Card: Describe a Book That Influenced You';
    expect(stableSlug(title)).toMatch(/^ielts-speaking-cue-card-describe-a-book-that-influenced-you-[a-z0-9]{1,6}$/);
    expect(stableSlug(title)).toBe(stableSlug(title));
  });
});

describe('topic -> item conversion', () => {
  const item = topicToItem(topics[0]);

  it('builds a Part 2 item tagged with its family first', () => {
    expect(item.part).toBe(2);
    expect(item.topicTags[0]).toBe(topics[0].family);
    expect(item.title.startsWith('IELTS Speaking Cue Card: ')).toBe(true);
  });

  it('carries the cue card and its linked question sets', () => {
    expect(item.cueCard.topic).toBe(`${topics[0].title}.`);
    expect(item.cueCard.bullets).toEqual(topics[0].bullets);
    expect(item.cueCard.explainLine).toBe(topics[0].explain);
    expect(item.cueCard.linkedPart1).toHaveLength(3);
    expect(item.cueCard.linkedPart3).toHaveLength(4);
    expect(item.cueCard.family).toBe(topics[0].family);
  });

  it('generates no round-off questions (one TTS clip per card)', () => {
    expect(item.roundOff).toEqual([]);
  });
});
