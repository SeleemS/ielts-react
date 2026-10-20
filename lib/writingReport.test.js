import { describe, expect, it } from 'vitest';
import { reduceForFree } from './writingReport';

const full = {
  overallBand: 6.5,
  criteria: {
    taskAchievement: { band: 6, strengths: ['Clear overview'], improvements: ['Compare the peaks'] },
    coherenceCohesion: { band: 7, strengths: ['Logical order'], improvements: ['Vary linkers'] },
    lexicalResource: { band: 6.5, strengths: ['Data vocabulary'], improvements: ['Avoid repetition'] },
    grammaticalRange: { band: 6, strengths: ['Some complex sentences'], improvements: ['Check articles'] },
  },
  summary: 'Secret summary',
  improvements: ['Secret plan'],
  correctedExamples: [{ original: 'a', suggestion: 'b' }, { original: 'c', suggestion: 'd' }],
  rewrite: { focus: 'Para 2', text: 'Secret rewrite' },
};

describe('reduceForFree', () => {
  it('keeps the overall band and only the first criterion', () => {
    const free = reduceForFree(full);
    expect(free.overallBand).toBe(6.5);
    expect(Object.keys(free.criteria)).toEqual(['taskAchievement']);
    expect(free.lockedCriteriaCount).toBe(3);
    expect(free.correctedExamples).toEqual([{ original: 'a', suggestion: 'b' }]);
    expect(free.lockedCorrectionCount).toBe(1);
    expect(free.rewriteLocked).toBe(true);
  });

  it('sends per-criterion fix counts for the locked criteria as numbers only', () => {
    const free = reduceForFree(full);
    expect(free.lockedCriteriaIssues).toEqual({ coherenceCohesion: 1, lexicalResource: 1, grammaticalRange: 1 });
    expect(free.lockedIssueCount).toBe(7);
  });

  it('never ships withheld text', () => {
    const json = JSON.stringify(reduceForFree(full));
    for (const secret of ['Logical order', 'Vary linkers', 'Data vocabulary', 'Check articles', 'Secret summary', 'Secret plan', 'Secret rewrite', '"c"']) {
      expect(json).not.toContain(secret);
    }
  });
});
