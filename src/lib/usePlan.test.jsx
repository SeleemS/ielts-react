// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'audit@example.com' },
  result: { data: null, error: null },
  setupError: null,
}));

vi.mock('./auth', () => ({
  useAuth: () => ({
    user: testState.user,
  }),
}));
vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            if (testState.setupError) throw testState.setupError;
            // Match PostgREST: an awaitable builder without .finally().
            return { then: (resolve, reject) => Promise.resolve(testState.result).then(resolve, reject) };
          },
        }),
      }),
    }),
  }),
}));

import { usePlan } from './usePlan';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function Harness() {
  const plan = usePlan();
  return (
    <output>
      {JSON.stringify({
        loading: plan.loading,
        plan: plan.plan,
        isPremium: plan.isPremium,
        error: plan.error,
      })}
    </output>
  );
}

async function renderHook() {
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return JSON.parse(container.querySelector('output').textContent);
}

beforeEach(() => {
  testState.user = { id: 'user-1', email: 'audit@example.com' };
  testState.result = { data: null, error: null };
  testState.setupError = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('usePlan query failures', () => {
  it('reports synchronous query setup failures without crashing the page', async () => {
    testState.setupError = new Error('client unavailable');
    const plan = await renderHook();
    expect(plan.loading).toBe(false);
    expect(plan.error).toBe('Could not verify your current plan. Please refresh and try again.');
  });
  it('restores loading while a newly signed-in owner query is unresolved', async () => {
    testState.user = null;
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });
    expect(JSON.parse(container.querySelector('output').textContent).loading).toBe(false);

    let resolveQuery;
    testState.result = new Promise((resolve) => {
      resolveQuery = resolve;
    });
    testState.user = { id: 'user-1', email: 'audit@example.com' };
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });

    const pending = JSON.parse(container.querySelector('output').textContent);
    expect(pending.loading).toBe(true);
    expect(pending.error).toBeNull();

    await act(async () => {
      resolveQuery({
        data: {
          plan: 'premium',
          plan_status: 'active',
          plan_renews_at: '2026-10-01T00:00:00.000Z',
        },
        error: null,
      });
      await Promise.resolve();
    });

    const settled = JSON.parse(container.querySelector('output').textContent);
    expect(settled.loading).toBe(false);
    expect(settled.isPremium).toBe(true);
  });

  it('exposes a resolved Supabase error instead of silently reporting Free', async () => {
    testState.result = {
      data: null,
      error: new Error('database unavailable'),
    };

    const plan = await renderHook();

    expect(plan.loading).toBe(false);
    expect(plan.isPremium).toBe(false);
    expect(plan.error).toBe(
      'Could not verify your current plan. Please refresh and try again.'
    );
  });

  it('returns verified Premium state without an error', async () => {
    testState.result = {
      data: {
        plan: 'premium',
        plan_status: 'active',
        plan_renews_at: '2026-10-01T00:00:00.000Z',
        plan_expires_at: null,
        billing_pause_until: null,
        billing_pause_used_at: null,
        stripe_customer_id: 'cus_test',
      },
      error: null,
    };

    const plan = await renderHook();

    expect(plan.loading).toBe(false);
    expect(plan.plan).toBe('premium');
    expect(plan.isPremium).toBe(true);
    expect(plan.error).toBeNull();
  });
});
