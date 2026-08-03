// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isStaleChunkError, recoverFromStaleChunk } from './clientErrors';

describe('isStaleChunkError', () => {
  it('matches the real stale-deploy signatures', () => {
    expect(isStaleChunkError({ name: 'ChunkLoadError', message: 'Loading chunk 4523 failed.' })).toBe(true);
    expect(isStaleChunkError({ message: 'Loading CSS chunk 12 failed (/_next/static/css/x.css)' })).toBe(true);
    expect(isStaleChunkError({ message: 'Failed to fetch dynamically imported module: https://x/_next/y.js' })).toBe(true);
    expect(isStaleChunkError('Importing a module script failed.')).toBe(true);
  });

  it('ignores ordinary errors and empty input', () => {
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isStaleChunkError({ message: 'Network request failed' })).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe('recoverFromStaleChunk', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('reloads once per URL, never twice (loop guard)', () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, href: 'https://www.ielts-bank.com/pricing' },
    });

    expect(recoverFromStaleChunk('/pricing')).toBe(true);
    expect(assign).toHaveBeenCalledWith('/pricing');
    // Same target again: the guard must refuse (a genuine chunk 404 that
    // is NOT staleness would otherwise reload forever).
    expect(recoverFromStaleChunk('/pricing')).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('does not reload when sessionStorage is unavailable', () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, href: 'https://www.ielts-bank.com/' },
    });
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });

    expect(recoverFromStaleChunk('/x')).toBe(false);
    expect(assign).not.toHaveBeenCalled();

    spy.mockRestore();
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });
});
