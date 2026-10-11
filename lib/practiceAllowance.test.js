import { describe, expect, it } from 'vitest';
import { parseFreePracticeLimit, practiceAllowanceCopy, practiceAllowanceState } from './practiceAllowance';

describe('free practice allowance', () => {
  it('defaults to 3 and accepts positive integers or an off switch', () => {
    expect(parseFreePracticeLimit(undefined)).toBe(3);
    expect(parseFreePracticeLimit('')).toBe(3);
    expect(parseFreePracticeLimit('5')).toBe(5);
    expect(parseFreePracticeLimit('unlimited')).toBe(Infinity);
    expect(parseFreePracticeLimit('off')).toBe(Infinity);
    for (const bad of ['0', '-2', '2.5', 'abc']) expect(parseFreePracticeLimit(bad)).toBe(3);
  });

  it('allows new passages until the limit, then only retries', () => {
    const used = new Set(['a', 'b']);
    expect(practiceAllowanceState({ usedIds: used, currentId: 'c', limit: 3 })).toMatchObject({ limited: true, remaining: 1, canSubmit: true });
    used.add('c');
    expect(practiceAllowanceState({ usedIds: used, currentId: 'd', limit: 3 })).toMatchObject({ remaining: 0, canSubmit: false });
    expect(practiceAllowanceState({ usedIds: used, currentId: 'b', limit: 3 })).toMatchObject({ canSubmit: true, isRetry: true });
  });

  it('never limits Pro or an unlimited configuration', () => {
    const used = new Set(['a', 'b', 'c', 'd']);
    expect(practiceAllowanceState({ usedIds: used, currentId: 'e', limit: 3, isPremium: true })).toMatchObject({ limited: false, canSubmit: true });
    expect(practiceAllowanceState({ usedIds: used, currentId: 'e', limit: Infinity })).toMatchObject({ limited: false, canSubmit: true });
  });

  it('describes the limit honestly and falls back to the old copy when off', () => {
    expect(practiceAllowanceCopy(3).freeMarking).toBe('3 practice tests with instant marking');
    expect(practiceAllowanceCopy(1).signUpDescription).toContain('1 practice test with instant marking');
    expect(practiceAllowanceCopy(Infinity).proLine).toBeNull();
    expect(practiceAllowanceCopy(Infinity).pricingFaq).toContain('stays free');
  });
});
