import { describe, expect, it } from 'vitest';
import { buildSpeakingAnswerCapsule, speakingAnswerCapsuleText } from './speakingAnswerCapsule';

const cueCardItem = {
  part: 2,
  title: 'IELTS Speaking Cue Card: Describe a Neighbour You Get on Well With',
  topic: 'Describe a neighbour you get on well with.',
  cueCard: {
    topic: 'Describe a neighbour you get on well with.',
    bullets: ['who this neighbour is', 'how long you have known them', 'what you usually do together'],
    explainLine: 'and explain why you get on so well with this person.',
    prepSeconds: 60,
    speakSecondsMin: 60,
    speakSecondsMax: 120,
    family: 'people',
  },
};

describe('buildSpeakingAnswerCapsule (Part 2 cue cards)', () => {
  const capsule = buildSpeakingAnswerCapsule(cueCardItem);

  it('says what to talk about, using the card\'s own bullets and explain line', () => {
    expect(capsule.headline).toContain('Describe a neighbour you get on well with');
    expect(capsule.headline).toContain('who this neighbour is');
    expect(capsule.headline).toContain('what you usually do together');
    expect(capsule.headline).toContain('then explain why you get on so well with this person');
  });

  it('says how to structure the long turn with real timings', () => {
    expect(capsule.structure).toContain('60 seconds to make notes');
    expect(capsule.structure).toContain('1–2 minutes');
    expect(capsule.structure).toMatch(/30–45 seconds on the explanation/);
  });

  it('names exactly one trap, specialised to the card', () => {
    expect(capsule.trap.startsWith('The trap:')).toBe(true);
    expect(buildSpeakingAnswerCapsule({ ...cueCardItem, cueCard: { ...cueCardItem.cueCard, topic: 'Describe a time you were late.' } }).trap).toContain('narrative tenses');
    expect(
      buildSpeakingAnswerCapsule({
        ...cueCardItem,
        cueCard: { ...cueCardItem.cueCard, topic: 'Describe a place you would like to live in the future.' },
      }).trap
    ).toContain('hypothetical');
    expect(
      buildSpeakingAnswerCapsule({
        ...cueCardItem,
        cueCard: { ...cueCardItem.cueCard, topic: 'Describe a person who is good at their job.' },
      }).trap
    ).toContain('concrete story');
  });

  it('is deterministic — same item in, same capsule out', () => {
    expect(buildSpeakingAnswerCapsule(cueCardItem)).toEqual(capsule);
  });

  it('flattens to a single string for meta/JSON-LD use', () => {
    const text = speakingAnswerCapsuleText(cueCardItem);
    expect(text).toContain(capsule.headline);
    expect(text).toContain(capsule.trap);
    expect(text.length).toBeGreaterThan(200);
  });
});

describe('buildSpeakingAnswerCapsule (Part 1 and Part 3)', () => {
  it('describes a Part 1 topic set with answer length guidance', () => {
    const capsule = buildSpeakingAnswerCapsule({
      part: 1,
      title: 'IELTS Speaking Part 1: Friends Questions',
      topic: 'Friends',
      part1: { topic: 'Friends', questions: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }] },
    });
    expect(capsule.headline).toContain('Part 1 questions on Friends');
    expect(capsule.headline).toContain('4 of them');
    expect(capsule.structure).toContain('two or three sentences');
    expect(capsule.trap).toContain('one-word answers'.replace('o', 'o'));
  });

  it('describes a Part 3 discussion set', () => {
    const capsule = buildSpeakingAnswerCapsule({
      part: 3,
      title: 'IELTS Speaking Part 3: Technology',
      topic: 'Technology and society',
      part3: { theme: 'Technology and society', questions: [{ text: 'a' }, { text: 'b' }] },
    });
    expect(capsule.headline).toContain('Part 3 discussion questions on Technology and society');
    expect(capsule.structure).toContain('40–60 seconds');
    expect(capsule.trap).toContain('people in general');
  });

  it('returns null for anything that is not a speaking item', () => {
    expect(buildSpeakingAnswerCapsule(null)).toBeNull();
    expect(buildSpeakingAnswerCapsule({ part: 4 })).toBeNull();
    expect(speakingAnswerCapsuleText(null)).toBe('');
  });
});
