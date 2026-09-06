import { describe, expect, it } from 'vitest';
import { buildUpgradeHref, checkoutReturnUrls, normalizeUpgradeContext } from './upgradeContext';

describe('checkout return context', () => {
  it.each([
    ['writing', '/writingquestion/task-2-example'], ['writing', '/ielts-writing-checker'], ['writing', '/band-estimator'],
    ['speaking', '/speakingquestion/part-2-topic'], ['mock', '/mock/academic-reading-1'], ['mock', '/mock-test'],
  ])('preserves %s practice paths across pricing and both checkout returns', (upgrade, return_to) => {
    const context = { upgrade, stage: 'saved', return_to };
    const pricing = new URL(buildUpgradeHref(context), 'https://www.ielts-bank.com');
    expect(Object.fromEntries(pricing.searchParams)).toEqual(context);
    const urls = checkoutReturnUrls(pricing.origin, Object.fromEntries(pricing.searchParams));
    for (const result of ['success', 'cancel']) {
      const target = new URL(urls[`${result}_url`]);
      expect(target.pathname).toBe('/pricing');
      expect(target.searchParams.get('return_to')).toBe(return_to);
      expect(target.searchParams.get('upgrade')).toBe(upgrade);
      expect(target.searchParams.get('stage')).toBe('saved');
    }
    expect(urls.success_url).toContain('session_id={CHECKOUT_SESSION_ID}');
  });
  it.each([
    'https://attacker.example', '//attacker.example', '/\\attacker.example',
    '/writingquestion/../billing', '/writingquestion/%2f%2fattacker.example',
    '/writingquestion/example?essay=private', '/writingquestion/example#audio',
    '/speakingquestion/topic', '/api/billing/checkout', '/writingquestion/example\n',
  ])('rejects untrusted or mismatched return context %s', (return_to) => {
    expect(normalizeUpgradeContext({ upgrade: 'writing', stage: 'saved', return_to })).toEqual({ upgrade: 'writing', stage: 'saved' });
  });
  it('drops arrays, unknown stages and private/unrelated data', () => {
    expect(normalizeUpgradeContext({ upgrade: ['writing'], return_to: '/ielts-writing-checker' })).toEqual({});
    expect(normalizeUpgradeContext({ upgrade: 'writing', stage: 'other', return_to: ['/ielts-writing-checker'], essay: 'private', audioPath: 'private' })).toEqual({ upgrade: 'writing' });
    expect(buildUpgradeHref({ upgrade: 'speaking', stage: 'sample', essay: 'private' })).toBe('/pricing?upgrade=speaking&stage=sample');
  });
  it('preserves the existing generic checkout contract with no context', () => {
    expect(checkoutReturnUrls('https://www.ielts-bank.com')).toEqual({
      success_url: 'https://www.ielts-bank.com/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://www.ielts-bank.com/pricing?checkout=canceled',
    });
  });
});
