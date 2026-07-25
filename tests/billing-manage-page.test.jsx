// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  planError: null,
  planSku: 'monthly',
  planStatus: 'active',
  isPremium: true,
  pauseUntil: null,
  expiresAt: null,
  hasBillingAccount: true,
  accessToken: 'billing-access-token',
  sessionError: null,
  rejectSession: false,
}));

vi.mock('next/head', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('../src/components/Navbar', () => ({
  default: () => React.createElement('nav'),
}));
vi.mock('../src/components/Footer', () => ({
  default: () => React.createElement('footer'),
}));
vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'audit@example.com' },
    loading: false,
  }),
}));
vi.mock('../src/lib/usePlan', () => ({
  usePlan: () => ({
    isPremium: testState.isPremium,
    planSku: testState.planSku,
    planStatus: testState.planStatus,
    renewsAt: '2026-10-01T00:00:00.000Z',
    expiresAt: testState.expiresAt,
    pauseUntil: testState.pauseUntil,
    pauseUsedAt: null,
    hasBillingAccount: testState.hasBillingAccount,
    loading: false,
    error: testState.planError,
  }),
}));
vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => {
        if (testState.rejectSession) throw testState.sessionError;
        return {
          data: {
            session: testState.accessToken
              ? { access_token: testState.accessToken }
              : null,
          },
          error: testState.sessionError,
        };
      },
    },
  }),
}));
vi.mock('../src/lib/analytics', () => ({
  track: vi.fn(),
}));

import ManageBillingPage from '../pages/billing/manage';
import { track } from '../src/lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  testState.planError = null;
  testState.planSku = 'monthly';
  testState.planStatus = 'active';
  testState.isPremium = true;
  testState.pauseUntil = null;
  testState.expiresAt = null;
  testState.hasBillingAccount = true;
  testState.accessToken = 'billing-access-token';
  testState.sessionError = null;
  testState.rejectSession = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  global.fetch = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete global.fetch;
  vi.clearAllMocks();
});

describe('billing pause state', () => {
  it('keeps billing management in a resuming state until Stripe confirms payment', async () => {
    testState.planStatus = 'paused';
    testState.isPremium = false;
    testState.pauseUntil = '2020-08-20T00:00:00.000Z';

    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Billing is resuming');
    expect(container.textContent).toContain('access returns after Stripe confirms payment');
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent.includes('Pause once')
      )
    ).toBe(false);
  });

  it('immediately removes the one-time action and shows the paused state after success', async () => {
    const resumesAt = new Date(Date.now() + 30 * 86400000).toISOString();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ paused: true, resumesAt }),
    });
    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    const pauseButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.includes('Pause once')
    );
    expect(pauseButton).toBeTruthy();

    await act(async () => {
      pauseButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/billing/pause', {
      method: 'POST',
      headers: { Authorization: 'Bearer billing-access-token' },
    });
    expect(container.textContent).toContain('Premium is paused');
    expect(container.textContent).toContain('Your current pause ends');
    expect(container.textContent).toContain('unused-time credit');
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent.includes('Pause once')
      )
    ).toBe(false);
    expect(track).toHaveBeenCalledWith('subscription_pause', {
      source: 'billing_interstitial',
    });
  });

  it('hides all billing mutations when plan verification fails', async () => {
    testState.planError =
      'Could not verify your current plan. Please refresh and try again.';
    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Billing actions are temporarily disabled.'
    );
    expect(
      [...container.querySelectorAll('button')].some(
        (button) =>
          button.textContent.includes('Pause once')
          || button.textContent.includes('Continue to Stripe')
      )
    ).toBe(false);
  });
});

describe('billing account state', () => {
  it('does not offer the active-only pause during a trial', async () => {
    testState.planStatus = 'trialing';

    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent.includes('Pause once')
      )
    ).toBe(false);
    expect(container.textContent).toContain('Upgrade to 3 months');
  });

  it('shows a scheduled cancellation without impossible upgrade actions', async () => {
    testState.planStatus = 'canceled';

    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Premium is ending');
    expect(container.textContent).toContain('It will not renew');
    expect(container.textContent).toContain('Review your canceled plan');
    expect(container.textContent).toContain('scheduled cancellation at period end');
    expect(container.textContent).not.toContain('Upgrade to 3 months');
    expect(container.textContent).not.toContain('Upgrade to annual');
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent.includes('Pause once')
      )
    ).toBe(false);
    expect(container.textContent).not.toContain('Prefer no subscription next time');
  });

  it('sends a past-due learner to payment recovery without upgrade actions', async () => {
    testState.planStatus = 'past_due';

    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Payment needs attention');
    expect(container.textContent).toContain('payment is past due');
    expect(container.textContent).toContain('Update payment details');
    expect(container.textContent).toContain('temporary grace period');
    expect(container.textContent).not.toContain('Upgrade to 3 months');
    expect(container.textContent).not.toContain('Upgrade to annual');
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent.includes('Pause once')
      )
    ).toBe(false);
  });

  it('does not tell an Exam Pass holder to cancel a non-renewing purchase', async () => {
    testState.planSku = 'exam_pass';
    testState.expiresAt = '2026-10-01T00:00:00.000Z';

    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Exam Pass is active');
    expect(container.textContent).toContain('Review billing history');
    expect(container.textContent).toContain('There is no active recurring plan to cancel');
    expect(container.textContent).not.toContain('schedule cancellation at period end');
    expect(container.textContent).not.toContain('Prefer no subscription next time');
  });
});

describe('billing action session verification', () => {
  it.each([
    ['Continue to Stripe', 'resolved', false],
    ['Continue to Stripe', 'rejected', true],
    ['Pause once', 'resolved', false],
    ['Pause once', 'rejected', true],
    ['Upgrade to annual', 'resolved', false],
    ['Upgrade to annual', 'rejected', true],
  ])(
    'stops %s before its API call when session verification has a %s auth failure',
    async (actionLabel, _failureType, rejectSession) => {
      testState.accessToken = null;
      testState.sessionError = new Error('temporary auth outage');
      testState.rejectSession = rejectSession;

      await act(async () => {
        root.render(<ManageBillingPage />);
        await Promise.resolve();
      });

      const action = [...container.querySelectorAll('button')].find(
        (button) => button.textContent.includes(actionLabel)
      );
      expect(action).toBeTruthy();
      await act(async () => {
        action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Could not verify your signed-in session. Please refresh and try again.'
      );
    }
  );

  it('keeps a verified missing session on the reauthentication path', async () => {
    testState.accessToken = null;

    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    const portalButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.includes('Continue to Stripe')
    );
    await act(async () => {
      portalButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Please sign in again.'
    );
  });
});

describe('billing upgrade confirmation', () => {
  const quote = {
    targetSku: 'annual',
    amountDue: 3200,
    currency: 'usd',
    targetAmount: 4499,
    interval: 'year',
    intervalCount: 1,
    prorationDate: 1784600000,
    token: 'signed-quote-token',
  };

  it('previews the charge and requires explicit confirmation before upgrading', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          changed: false,
          requiresConfirmation: true,
          quote,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          changed: true,
          message: 'Your plan was upgraded.',
        }),
      });
    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    const annualButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.includes('Upgrade to annual')
    );
    await act(async () => {
      annualButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/billing/change-plan', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer billing-access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sku: 'annual', action: 'preview' }),
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Review your plan upgrade');
    expect(dialog?.textContent).toMatch(/USD\s44\.99 per year/);
    expect(dialog?.textContent).toMatch(/USD\s32\.00/);
    expect(track).not.toHaveBeenCalledWith(
      'subscription_plan_change',
      expect.anything()
    );

    const confirmButton = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent.includes('Confirm upgrade and charge')
    );
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/billing/change-plan', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer billing-access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sku: 'annual',
        action: 'confirm',
        acceptedAmount: 3200,
        acceptedCurrency: 'usd',
        prorationDate: 1784600000,
        quoteToken: 'signed-quote-token',
      }),
    });
    expect(track).toHaveBeenCalledWith('subscription_plan_change', {
      from_sku: 'monthly',
      to_sku: 'annual',
    });
  });

  it('shows a recalculated quote and requires another confirmation', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ requiresConfirmation: true, quote }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          requiresConfirmation: true,
          error: 'The upgrade estimate changed or expired. Review it and confirm again.',
          quote: { ...quote, amountDue: 3300, prorationDate: 1784600100 },
        }),
      });
    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    const annualButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.includes('Upgrade to annual')
    );
    await act(async () => {
      annualButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const firstDialog = document.querySelector('[role="dialog"]');
    const confirmButton = [...firstDialog.querySelectorAll('button')].find(
      (button) => button.textContent.includes('Confirm upgrade and charge')
    );
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const updatedDialog = document.querySelector('[role="dialog"]');
    expect(updatedDialog?.textContent).toMatch(/USD\s33\.00/);
    expect(updatedDialog?.querySelector('[role="alert"]')?.textContent).toMatch(
      /changed or expired/i
    );
    expect(track).not.toHaveBeenCalledWith(
      'subscription_plan_change',
      expect.anything()
    );
  });
});
