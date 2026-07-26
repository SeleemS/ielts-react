// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  router: {
    isReady: true,
    query: {},
  },
  user: null,
  authLoading: false,
  accessToken: 'test-access-token',
  sessionError: null,
  rejectSession: false,
  planError: null,
  pauseUntil: null,
  hasBillingAccount: false,
  planStatus: 'inactive',
}));

vi.mock('next/head', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('next/router', () => ({
  useRouter: () => testState.router,
}));
vi.mock('../src/components/Navbar', () => ({
  default: () => React.createElement('nav'),
}));
vi.mock('../src/components/Footer', () => ({
  default: () => React.createElement('footer'),
}));
vi.mock('../src/components/auth/SignInDialog', () => ({
  default: ({ open, onOpenChange, redirectOnFinish }) =>
    open
      ? React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'pricing-auth-dialog',
            'data-redirect-on-finish': String(redirectOnFinish),
            onClick: () => onOpenChange(false),
          },
          'Finish authentication'
        )
      : null,
}));
vi.mock('../src/components/question/WritingScoreReport', () => ({
  default: () => React.createElement('div', null, 'Sample report'),
}));
vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({
    user: testState.user,
    loading: testState.authLoading,
  }),
}));
vi.mock('../src/lib/usePlan', () => ({
  usePlan: () => ({
    isPremium: false,
    planStatus: testState.planStatus,
    renewsAt: null,
    expiresAt: null,
    pauseUntil: testState.pauseUntil,
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
              ? {
                  access_token: testState.accessToken,
                }
              : null,
          },
          error: testState.sessionError,
        };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  }),
  getPublicTrustStats: async () => ({ questionsAnswered: 0 }),
}));
vi.mock('../lib/billing', () => ({
  isPppCountry: () => false,
}));
vi.mock('../src/lib/analytics', () => ({
  track: vi.fn(),
  gaClientId: () => null,
}));
vi.mock('../lib/pricingSeo', () => ({
  PRICING_SEO: {
    title: 'Pricing test',
    description: 'Pricing description',
    canonical: 'https://www.ielts-bank.com/pricing',
    ogImage: 'https://www.ielts-bank.com/api/og?type=pricing',
    imageAlt: 'Pricing',
  },
}));

import PricingPage from '../pages/pricing';
import { track } from '../src/lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

async function renderPage() {
  await act(async () => {
    root.render(<PricingPage />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  testState.router = {
    isReady: true,
    query: {
      checkout: 'success',
      session_id: 'cs_test_checkout_return',
    },
  };
  testState.user = null;
  testState.authLoading = false;
  testState.accessToken = 'test-access-token';
  testState.sessionError = null;
  testState.rejectSession = false;
  testState.planError = null;
  testState.pauseUntil = null;
  testState.hasBillingAccount = false;
  testState.planStatus = 'inactive';
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

describe('pricing checkout return verification', () => {
  it('does not claim success for a signed-out forged checkout URL', async () => {
    await renderPage();

    expect(container.textContent).not.toContain("You're in. Do this first:");
    expect(container.textContent).toContain(
      'Sign in with the account used at checkout to confirm Pro access.'
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalledWith(
      'purchase_success',
      expect.anything()
    );
  });

  it('does not record or display a purchase when verification fails', async () => {
    testState.user = { id: 'user-1' };
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ active: false }),
    });

    await renderPage();

    expect(container.textContent).not.toContain("You're in. Do this first:");
    expect(container.textContent).toContain(
      'Pro access could not be confirmed yet.'
    );
    expect(track).not.toHaveBeenCalledWith(
      'purchase_success',
      expect.anything()
    );
  });

  it('shows activation and tracks the purchase only after server verification', async () => {
    testState.user = { id: 'user-1' };
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ active: true }),
    });

    await renderPage();

    expect(global.fetch).toHaveBeenCalledWith('/api/billing/verify-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-access-token',
      },
      body: JSON.stringify({ session_id: 'cs_test_checkout_return' }),
    });
    expect(container.textContent).toContain("You're in. Do this first:");
    expect(track).toHaveBeenCalledWith('purchase_success', {
      source: 'pricing',
    });
  });

  it('requires an explicit active entitlement even on an HTTP success', async () => {
    testState.user = { id: 'user-1' };
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ active: false }),
    });

    await renderPage();

    expect(container.textContent).not.toContain("You're in. Do this first:");
    expect(container.textContent).toContain(
      'Pro access could not be confirmed yet.'
    );
    expect(track).not.toHaveBeenCalledWith(
      'purchase_success',
      expect.anything()
    );
  });
});

describe('pricing authentication handoff', () => {
  it('shows billing management instead of a second checkout while access is paused', async () => {
    testState.router = { isReady: true, query: {} };
    testState.user = { id: 'user-1' };
    testState.pauseUntil = '2099-08-20T00:00:00.000Z';
    testState.hasBillingAccount = true;

    await renderPage();

    expect(container.textContent).toContain('Your Pro plan is paused');
    expect(container.textContent).toContain('Premium access resumes');
    expect(container.textContent).not.toContain('Choose this plan');
    expect(container.querySelector('a[href="/billing/manage"]')).not.toBeNull();
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/billing/checkout',
      expect.anything()
    );
  });

  it('does not reopen checkout while a due pause is waiting for payment', async () => {
    testState.router = { isReady: true, query: {} };
    testState.user = { id: 'user-1' };
    testState.pauseUntil = '2020-08-20T00:00:00.000Z';
    testState.planStatus = 'paused';
    testState.hasBillingAccount = true;

    await renderPage();

    expect(container.textContent).toContain('Your Pro plan is resuming');
    expect(container.textContent).toContain('Access returns after payment succeeds');
    expect(container.textContent).not.toContain('Choose this plan');
    expect(container.querySelector('a[href="/billing/manage"]')).not.toBeNull();
  });

  it('gives the checkout action a plan-specific accessible name', async () => {
    testState.router = {
      isReady: true,
      query: {},
    };

    await renderPage();

    // Single Pro plan; the toggle defaults to the Monthly cadence.
    expect(
      [...container.querySelectorAll('main button[aria-label]')].map(
        (button) => button.getAttribute('aria-label')
      )
    ).toEqual(['Choose Monthly plan']);
  });

  it('stays on pricing and resumes the plan selected before sign-in', async () => {
    testState.router = {
      isReady: true,
      query: {},
    };
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Audit stop before Stripe redirect.' }),
    });
    await renderPage();

    const proButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Choose this plan'
    );
    act(() => {
      proButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const dialog = container.querySelector('[data-testid="pricing-auth-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('data-redirect-on-finish')).toBe('false');

    testState.user = { id: 'user-1' };
    await act(async () => {
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/billing/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-access-token',
      },
      body: JSON.stringify({ sku: 'monthly', offer: '', ga_cid: null }),
    });
  });

  it.each([
    ['resolved', false],
    ['rejected', true],
  ])(
    'keeps a signed-in learner out of a false sign-in flow when session verification is %s',
    async (_failureType, rejectSession) => {
      testState.router = { isReady: true, query: {} };
      testState.user = { id: 'user-1' };
      testState.accessToken = null;
      testState.sessionError = new Error('temporary auth outage');
      testState.rejectSession = rejectSession;

      await renderPage();

      const proButton = [...container.querySelectorAll('button')].find(
        (button) => button.textContent.trim() === 'Choose this plan'
      );
      await act(async () => {
        proButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container.querySelector('[data-testid="pricing-auth-dialog"]')).toBeNull();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Could not verify your signed-in session. Please refresh and try again.'
      );
      expect(global.fetch).not.toHaveBeenCalled();
    }
  );

  it('disables every checkout action when current plan verification fails', async () => {
    testState.router = {
      isReady: true,
      query: {},
    };
    testState.planError =
      'Could not verify your current plan. Please refresh and try again.';

    await renderPage();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Checkout is temporarily disabled'
    );
    const checkoutButtons = [...container.querySelectorAll('button')].filter(
      (button) => button.textContent.includes('Choose this plan')
    );
    expect(checkoutButtons).toHaveLength(1);
    expect(checkoutButtons.every((button) => button.disabled)).toBe(true);
  });
});
