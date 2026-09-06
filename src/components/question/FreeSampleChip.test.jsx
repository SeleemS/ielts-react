// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: null, used: false }));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../../lib/usePlan', () => ({ usePlan: () => ({ loading: false, isPremium: false }) }));
vi.mock('../../lib/useFreeWritingSample', () => ({ useFreeWritingSample: () => ({ loading: false, used: state.used }) }));
import FreeSampleChip from './FreeSampleChip';
beforeEach(() => { state.user = null; state.used = false; });
describe('FreeSampleChip current catalog rendering', () => {
  it('renders signed-out writing guidance without resolving a retired plan', () => {
    expect(renderToStaticMarkup(<FreeSampleChip />)).toContain('Includes one free AI score');
  });
  it('links used samples to current regional pricing without assuming a retired SKU', () => {
    state.user = { id: 'qa' }; state.used = true;
    const html = renderToStaticMarkup(<FreeSampleChip />);
    expect(html).toContain('/pricing?upgrade=writing');
    expect(html).toContain('See Pro plans');
  });
});
