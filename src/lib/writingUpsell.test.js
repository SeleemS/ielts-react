import { describe, expect, it } from 'vitest';
import { formatResultScore, writingPromptVariant } from './writingUpsell';

const base = {
  skill: 'reading',
  isMock: false,
  isPremium: false,
  planLoading: false,
  freeSampleUsed: null,
  sampleLoading: false,
};

describe('writingPromptVariant', () => {
  it('offers the free report to a signed-out visitor', () => {
    expect(writingPromptVariant(base)).toBe('free');
    expect(writingPromptVariant({ ...base, skill: 'listening' })).toBe('free');
  });

  it('offers the free report to a signed-in user who still has the sample', () => {
    expect(writingPromptVariant({ ...base, freeSampleUsed: false })).toBe('free');
  });

  it('switches to the upgrade offer once the free sample is spent', () => {
    expect(writingPromptVariant({ ...base, freeSampleUsed: true })).toBe('upgrade');
  });

  it('never upsells a Pro subscriber', () => {
    expect(writingPromptVariant({ ...base, isPremium: true, freeSampleUsed: true })).toBe(
      'premium'
    );
    expect(writingPromptVariant({ ...base, isPremium: true })).toBe('premium');
  });

  it('stays hidden inside mock tests', () => {
    expect(writingPromptVariant({ ...base, isMock: true })).toBeNull();
    expect(writingPromptVariant({ ...base, isMock: true, freeSampleUsed: true })).toBeNull();
  });

  it('stays hidden for skills that are not reading or listening', () => {
    expect(writingPromptVariant({ ...base, skill: 'writing' })).toBeNull();
    expect(writingPromptVariant({ ...base, skill: 'speaking' })).toBeNull();
    expect(writingPromptVariant({ ...base, skill: undefined })).toBeNull();
  });

  it('shows nothing while entitlements are still resolving', () => {
    expect(writingPromptVariant({ ...base, planLoading: true })).toBeNull();
    expect(writingPromptVariant({ ...base, sampleLoading: true })).toBeNull();
  });
});

describe('formatResultScore', () => {
  it('prefers the band estimate the results UI already shows', () => {
    expect(formatResultScore({ skill: 'reading', band: 6.5, score: 9, total: 13 })).toBe(
      'Your reading is Band 6.5'
    );
    expect(formatResultScore({ skill: 'listening', band: 7 })).toBe(
      'Your listening is Band 7'
    );
  });

  it('falls back to the raw fraction when no band exists', () => {
    expect(
      formatResultScore({ skill: 'listening', band: null, score: 6, total: 10 })
    ).toBe('You scored 6/10 on Listening');
  });

  it('degrades gracefully with neither band nor score', () => {
    expect(formatResultScore({ skill: 'reading', band: null, total: 0 })).toBe(
      'Nice work on Reading'
    );
  });
});
