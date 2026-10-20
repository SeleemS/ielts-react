// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const state = { isPremium: false, loading: false };

vi.mock('../lib/usePlan', () => ({ usePlan: () => ({ ...state }) }));
vi.mock('../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) => React.createElement('a', { href, ...rest }, children),
}));

import AiQuotaPanel from './AiQuotaPanel';
import { track } from '../lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function render(props = {}) {
  act(() => {
    root.render(<AiQuotaPanel open skill="writing" {...props} />);
  });
}

beforeEach(() => {
  state.isPremium = false;
  state.loading = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.cookie = 'ib_country=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  container.remove();
  vi.clearAllMocks();
});

describe('AiQuotaPanel plan verification', () => {
  it('defers the modal and impression until a Premium owner is verified', () => {
    state.loading = true;
    render();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toBe('');
    expect(track).not.toHaveBeenCalled();

    state.loading = false;
    state.isPremium = true;
    render();

    expect(container.textContent).toContain('You’ve hit a fair-use limit');
    expect(container.textContent).not.toContain('Upgrade to Premium');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('premium_gate', {
      source: 'quota_modal',
      stage: 'impression',
      skill: 'writing',
      premium: true,
    });
  });

  it('shows and attributes the upgrade pitch after a Free owner is verified', () => {
    render();

    expect(container.textContent).toContain('AI Writing scoring is a Premium feature');
    expect(container.textContent).toContain('Upgrade to Premium');
    expect(track).toHaveBeenCalledWith('premium_gate', {
      source: 'quota_modal',
      stage: 'impression',
      skill: 'writing',
      premium: false,
    });
  });
});

describe('AiQuotaPanel plan emphasis by market', () => {
  it('keeps the standard subscription-first line outside pass-first markets', () => {
    document.cookie = 'ib_country=US; path=/';
    render();
    expect(container.textContent).toContain('From $4.17/mo on the annual plan, or a');
    expect(container.textContent).not.toContain('no auto-renew');
  });

  it('leads with the one-time pass at the regional price in India', () => {
    document.cookie = 'ib_country=IN; path=/';
    render();
    const text = container.textContent;
    expect(text).toContain('Exam Pass: $5.99 · One payment · no auto-renew');
    expect(text.indexOf('Exam Pass')).toBeLessThan(text.indexOf('subscribe from'));
    expect(text).toContain('subscribe from $1.67/mo');
    expect(text).not.toContain('$19.99');
  });

  it('leads with the pass at global prices in China', () => {
    document.cookie = 'ib_country=CN; path=/';
    render();
    expect(container.textContent).toContain('Exam Pass: $19.99 · One payment · no auto-renew');
  });
});
