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
  isPremium: false,
  expiresAt: null,
  renewsAt: null,
  ppp: false,
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
  default: ({ open, onOpenChange, redirectOnFinish, title }) =>
    open
      ? React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'pricing-auth-dialog',
            'data-redirect-on-finish': String(redirectOnFinish),
            'data-title': title,
            onClick: () => onOpenChange(false),
          },
          'Finish authentication'
        )
      : null,
}));
vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({
    user: testState.user,
    loading: testState.authLoading,
  }),
}));
vi.mock('../src/lib/usePlan', () => ({
  usePlan: () => ({
    isPremium: testState.isPremium,
    planStatus: testState.planStatus,
    renewsAt: testState.renewsAt,
    expiresAt: testState.expiresAt,
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
  isPppCountry: () => testState.ppp,
  isPassFirstMarket: (country) => testState.ppp || ['CN', 'HK'].includes(country),
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
  testState.isPremium = false;
  testState.expiresAt = null;
  testState.renewsAt = null;
  testState.ppp = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  global.fetch = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  document.cookie = 'ib_country=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
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

  it('gives every checkout action a plan-specific accessible name', async () => {
    testState.router = {
      isReady: true,
      query: {},
    };

    await renderPage();

    // Exam Pass leads both the visual grid and accessible checkout actions.
    expect(
      [...container.querySelectorAll('main button[aria-label]')].map(
        (button) => button.getAttribute('aria-label')
      )
    ).toEqual(['Choose Exam Pass plan', 'Choose Monthly plan', 'Choose Annual plan']);
    expect(container.textContent).toContain('$8.99');
    expect(container.textContent).toContain('$49.99');
    expect(container.textContent).toContain('$19.99');
    expect(container.textContent).toContain('60 live AI examiner minutes for your 30 days');
    expect(container.textContent).toContain('30 days · no subscription');
    // Item 39: no fictitious anchors — no price is struck through. The only
    // strike-through allowed is a corrected sentence inside the sample report.
    expect(container.querySelector('#plans .line-through')).toBeNull();
    for (const node of container.querySelectorAll('.line-through')) {
      expect(node.closest('#sample-report')).not.toBeNull();
    }
  });

  it.each(['writing', 'speaking'])('only claims saved %s work when stage=saved', async (upgrade) => {
    testState.router = { isReady: true, query: { upgrade, checkout: 'canceled' } };
    await renderPage();
    expect(container.textContent).not.toContain('is saved and waiting');
    expect(container.textContent).not.toContain('is still saved');

    testState.router.query.stage = 'saved';
    await renderPage();
    expect(container.textContent).toContain('is saved and waiting');
    expect(container.textContent).toContain('is still saved');
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

    const proButton = container.querySelector(
      'button[aria-label="Choose Annual plan"]'
    );
    act(() => {
      proButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const dialog = container.querySelector('[data-testid="pricing-auth-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('data-redirect-on-finish')).toBe('false');
    expect(track).toHaveBeenCalledWith('plan_select', expect.objectContaining({ sku: 'annual', signed_in: false, funnel_version: 'paid_journey_v2' }));
    expect(track).toHaveBeenCalledWith('checkout_auth_open', expect.objectContaining({ sku: 'annual' }));

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
      body: expect.any(String),
    });
    const checkoutCall = global.fetch.mock.calls.find(([url]) => url === '/api/billing/checkout');
    const payload = JSON.parse(checkoutCall[1].body);
    expect(payload).toMatchObject({ sku: 'annual', offer: '', ga_cid: null });
    expect(payload.funnel_intent_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(track.mock.calls.filter(([event]) => event === 'plan_select')).toHaveLength(1);
    expect(track).toHaveBeenCalledWith('checkout_auth_completed', expect.objectContaining({ funnel_intent_id: payload.funnel_intent_id }));
    expect(track).toHaveBeenCalledWith('checkout_request', expect.objectContaining({ funnel_intent_id: payload.funnel_intent_id }));
  });

  it('lets an anonymous learner dismiss upgrade auth without a checkout retry loop', async () => {
    testState.router = { isReady: true, query: {} };
    testState.user = { id: 'anon-user', is_anonymous: true };
    await renderPage();
    await act(async () => { container.querySelector('button[aria-label="Choose Exam Pass plan"]').click(); });
    const dialog = container.querySelector('[data-testid="pricing-auth-dialog"]');
    expect(dialog).not.toBeNull();
    await act(async () => { dialog.click(); });
    expect(container.querySelector('[data-testid="pricing-auth-dialog"]')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('omits checkout attribution after an explicit analytics opt-out', async () => {
    window.__ieltsOptionalConsent = 'denied';
    testState.router = { isReady: true, query: {} };
    testState.user = { id: 'user-1' };
    global.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    try {
      await renderPage();
      await act(async () => { container.querySelector('button[aria-label="Choose Annual plan"]').click(); });
      const call = global.fetch.mock.calls.find(([url]) => url === '/api/billing/checkout');
      expect(JSON.parse(call[1].body)).not.toHaveProperty('funnel_intent_id');
      expect(JSON.parse(call[1].body)).not.toHaveProperty('funnel_version');
    } finally { delete window.__ieltsOptionalConsent; }
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

      const proButton = container.querySelector(
        'button[aria-label="Choose Annual plan"]'
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

  it('leads a PPP region with the one-time Exam Pass at the regional price', async () => {
    testState.router = { isReady: true, query: {} };
    testState.ppp = true;

    await renderPage();

    // Regional pricing preserves the first-position one-time recommendation.
    expect(
      [...container.querySelectorAll('main button[aria-label]')].map((button) =>
        button.getAttribute('aria-label')
      )
    ).toEqual(['Choose Exam Pass plan', 'Choose Monthly plan', 'Choose Annual plan']);
    expect(container.textContent).toContain('30 days · no subscription');
    expect(container.textContent).toContain('$5.99');
    expect(container.textContent).toContain('30 live AI examiner minutes for your 30 days');
    expect(container.textContent).toContain('$4.99');
    expect(container.textContent).toContain('$19.99');
    expect(container.textContent).not.toContain('$8.99');
  });

  it('makes the pass the single primary offer, subscriptions second, in a pass-first market', async () => {
    testState.router = { isReady: true, query: {} };
    testState.ppp = true;

    await renderPage();

    const plans = container.querySelector('#plans');
    const text = plans.textContent;
    expect(text).toContain('One payment · no auto-renew');
    expect(text).toContain('Prefer a subscription?');
    // The pass card renders before the subscription heading; both subscriptions after it.
    expect(text.indexOf('Exam Pass')).toBeLessThan(text.indexOf('Prefer a subscription?'));
    expect(text.indexOf('Prefer a subscription?')).toBeLessThan(text.indexOf('Monthly'));
    expect(text.indexOf('Prefer a subscription?')).toBeLessThan(text.indexOf('Annual'));
    expect(container.textContent).toContain('Recommended for your region');
    expect(track).toHaveBeenCalledWith('view_item_list', expect.objectContaining({ pass_first: true }));
  });

  it('gives mainland China the pass-first layout at global prices', async () => {
    testState.router = { isReady: true, query: {} };
    document.cookie = 'ib_country=CN; path=/';

    await renderPage();

    expect(container.textContent).toContain('Prefer a subscription?');
    expect(container.textContent).toContain('$19.99');
    expect(container.textContent).not.toContain('$5.99');
    expect(container.textContent).not.toContain('Priced for your region');
  });

  it('keeps the standard three-card grid everywhere else', async () => {
    testState.router = { isReady: true, query: {} };
    document.cookie = 'ib_country=US; path=/';

    await renderPage();

    expect(container.textContent).not.toContain('Prefer a subscription?');
    expect(container.textContent).not.toContain('One payment · no auto-renew');
    expect(container.textContent).not.toContain('Recommended for your region');
    expect(track).toHaveBeenCalledWith('view_item_list', expect.objectContaining({ pass_first: false }));
  });

  it('points a pass-first buyer whose payment failed at the one-time pass', async () => {
    testState.router = { isReady: true, query: { checkout: 'canceled' } };
    testState.ppp = true;
    await renderPage();
    const payment = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Payment problem');
    await act(async () => { payment.click(); });
    expect(container.textContent).toContain('decline automatic renewals');
    expect(container.textContent).toContain('See the Exam Pass');
  });

  it('tells an active subscriber to manage the plan they already have', async () => {
    testState.router = { isReady: true, query: {} };
    testState.user = { id: 'user-1' };
    testState.isPremium = true;
    testState.planStatus = 'active';
    testState.renewsAt = '2099-01-20T00:00:00.000Z';
    testState.hasBillingAccount = true;

    await renderPage();

    expect(container.textContent).toContain('You already have Pro — manage your plan');
    expect(container.textContent).not.toContain('Choose this plan');
    expect(container.querySelector('a[href="/billing/manage"]')).not.toBeNull();
  });

  it('lets an Exam Pass holder subscribe, but not buy a second pass', async () => {
    testState.router = { isReady: true, query: {} };
    testState.user = { id: 'user-1' };
    testState.isPremium = true;
    testState.planStatus = 'active';
    testState.expiresAt = '2099-01-20T00:00:00.000Z';

    await renderPage();

    expect(container.textContent).toContain('Your pass ends on');
    const passButton = container.querySelector('button[aria-label="Choose Exam Pass plan"]');
    expect(passButton.disabled).toBe(true);
    expect(passButton.textContent).toContain('Pass active');
    const annualButton = container.querySelector('button[aria-label="Choose Annual plan"]');
    expect(annualButton.disabled).toBe(false);
  });

  it('points a duplicate-purchase refusal at billing management', async () => {
    testState.router = { isReady: true, query: {} };
    testState.user = { id: 'user-1' };
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'You already have Pro — manage your plan.',
        code: 'already_premium',
      }),
    });

    await renderPage();
    const annualButton = container.querySelector('button[aria-label="Choose Annual plan"]');
    await act(async () => {
      annualButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('You already have Pro');
    expect(alert.querySelector('a[href="/billing/manage"]')).not.toBeNull();
  });

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
    const checkoutButtons = [...container.querySelectorAll('button[aria-label^="Choose "]')];
    expect(checkoutButtons).toHaveLength(3);
    expect(checkoutButtons.every((button) => button.disabled)).toBe(true);
  });
});

describe('contextual Exam Pass checkout handoff', () => {
  it.each(['writing', 'speaking'])('returns verified %s buyers to the original practice', async (upgrade) => {
    testState.user = { id: 'user-1' };
    const returnTo = `/${upgrade}question/original-task`;
    testState.router.query = { checkout: 'success', session_id: 'cs_test_checkout_return', upgrade, stage: 'saved', return_to: returnTo };
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ active: true }) });
    await renderPage();
    const link = container.querySelector(`a[href="${returnTo}"]`);
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('you saved');
  });
  it('keeps the original return link after cancellation and rejects an external target', async () => {
    testState.router.query = { checkout: 'canceled', upgrade: 'writing', stage: 'saved', return_to: '/writingquestion/original-task' };
    await renderPage();
    expect(container.querySelector('a[href="/writingquestion/original-task"]').textContent).toBe('Return to your practice');
    testState.router.query.return_to = 'https://evil.example/';
    await renderPage();
    expect(container.querySelector('a[href="https://evil.example/"]')).toBeNull();
  });
  it('sends only normalized navigation context when starting checkout', async () => {
    testState.user = { id: 'user-1' };
    testState.router.query = { upgrade: 'writing', stage: 'sample', return_to: '/writingquestion/original-task', essay: 'private sample' };
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Test stop before Stripe.' }) });
    await renderPage();
    await act(async () => { container.querySelector('button[aria-label="Choose Exam Pass plan"]').click(); });
    const request = global.fetch.mock.calls.find(call => call[0] === '/api/billing/checkout');
    const body = JSON.parse(request[1].body);
    expect(body).toMatchObject({ sku: 'exam_pass', upgrade: 'writing', stage: 'sample', return_to: '/writingquestion/original-task' });
    expect(body).not.toHaveProperty('essay');
    expect(container.textContent).not.toContain('is saved and waiting');
  });
});

describe('checkout activation account ownership', () => {
  it('clears an active success screen when the account changes and verifies again', async () => {
    testState.user = { id: 'buyer-a' };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ active: true }) });
    await renderPage();
    expect(container.textContent).toContain("You're in. Do this first:");
    testState.user = { id: 'buyer-b' };
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ active: false }) });
    await renderPage();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain("You're in. Do this first:");
  });
  it('ignores a previous buyer response that arrives after an account switch', async () => {
    testState.user = { id: 'buyer-a' };
    let resolveBuyerA;
    global.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveBuyerA = resolve; }));
    await renderPage();
    testState.user = { id: 'buyer-b' };
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ active: false }) });
    await renderPage();
    await act(async () => { resolveBuyerA({ ok: true, json: async () => ({ active: true }) }); });
    expect(container.textContent).not.toContain("You're in. Do this first:");
    expect(track).not.toHaveBeenCalledWith('purchase_success', expect.anything());
  });
});

describe('pricing plan fit and clarity', () => {
  const featuredName = () => {
    // Plan cards are the positioned roots inside #plans (the grid wrapper
    // differs between the standard and pass-first layouts).
    const featured = [...container.querySelectorAll('#plans .relative')].find((card) =>
      card.className.includes('border-accent')
    );
    return featured?.querySelector('h2')?.textContent;
  };
  const pick = (label) =>
    [...container.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent === label);

  it('highlights the plan that fits the chosen exam timeline without changing prices', async () => {
    testState.router = { isReady: true, query: {} };
    await renderPage();
    expect(featuredName()).toBe('Exam Pass');

    act(() => pick('In 1–3 months').click());
    expect(featuredName()).toBe('Monthly');
    expect(pick('In 1–3 months').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('Fits your test date');
    expect(track).toHaveBeenCalledWith(
      'pricing_timeline_select',
      expect.objectContaining({ timeline: 'months', sku: 'monthly' })
    );

    act(() => pick('Not booked / 3+ months').click());
    expect(featuredName()).toBe('Annual');
    // Same three real prices, same checkout buttons in the same order.
    expect(container.textContent).toContain('$19.99');
    expect(container.textContent).toContain('$8.99');
    expect(container.textContent).toContain('$49.99');
    expect(
      [...container.querySelectorAll('main button[aria-label]')].map((b) => b.getAttribute('aria-label'))
    ).toEqual(['Choose Exam Pass plan', 'Choose Monthly plan', 'Choose Annual plan']);
  });

  it('shows plain per-day costs and plan-specific button labels', async () => {
    testState.router = { isReady: true, query: {} };
    await renderPage();
    expect(container.textContent).toContain('About $0.67 a day');
    expect(container.textContent).toContain('About $0.30 a day');
    expect(container.textContent).toContain('About $0.14 a day');
    expect(container.querySelector('button[aria-label="Choose Monthly plan"]').textContent).toContain('Start Monthly');
    expect(container.querySelector('button[aria-label="Choose Annual plan"]').textContent).toContain('Get Annual');
  });

  it('puts the plan cards before the free-tier strip', async () => {
    testState.router = { isReady: true, query: {} };
    await renderPage();
    const html = container.innerHTML;
    expect(html.indexOf('id="plans"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="plans"')).toBeLessThan(html.indexOf('Free — $0, forever'));
  });

  it('keeps the pass as the single primary card in pass-first markets while the picker moves the highlight', async () => {
    testState.router = { isReady: true, query: {} };
    testState.ppp = true;
    await renderPage();
    expect(featuredName()).toBe('Exam Pass');
    // Design per-day cost, computed from the gated pass length.
    expect(container.textContent).toContain('About $0.20 a day');
    expect(container.querySelector('button[aria-label="Choose Monthly plan"]').textContent).toContain('Start Monthly');

    act(() => pick('In 1–3 months').click());
    expect(featuredName()).toBe('Monthly');
    const text = container.querySelector('#plans').textContent;
    expect(text.indexOf('Exam Pass')).toBeLessThan(text.indexOf('Prefer a subscription?'));
    expect(text.indexOf('Prefer a subscription?')).toBeLessThan(text.indexOf('Monthly'));
    // Display-only: prices unchanged.
    expect(container.textContent).toContain('$5.99');
    expect(container.textContent).toContain('$4.99');
  });

  it('restates the chosen plan in the sign-in step', async () => {
    testState.router = { isReady: true, query: {} };
    await renderPage();
    await act(async () => {
      container.querySelector('button[aria-label="Choose Exam Pass plan"]').click();
    });
    expect(
      container.querySelector('[data-testid="pricing-auth-dialog"]').getAttribute('data-title')
    ).toBe('Create your account to get the Exam Pass');
  });
});

it('returns a verified buyer to the exact report instead of asking them to rescore', async () => {
  testState.user = { id: 'user-1' };
  testState.router.query = { checkout: 'success', session_id: 'cs_test_checkout_return', upgrade: 'writing', stage: 'sample', return_to: '/writing-report/10000000-0000-4000-8000-000000000001' };
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ active: true }) });
  await renderPage();
  const link = [...container.querySelectorAll('a')].find(a => a.textContent === 'Open your full essay report');
  expect(link?.getAttribute('href')).toBe(testState.router.query.return_to);
});
