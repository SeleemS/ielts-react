// @vitest-environment jsdom
// Regression pin for the Jul 2026 "analytics dies after onboarding" incident:
// walks the real signup-modal journey (signin gate on /, auto-confirmed
// signup, onboarding answered, redirect to /dashboard) with the REAL
// analytics, consent, telemetry, and dialog modules, then asserts the client
// event stream — delegated clicks, direct track(), and the session heartbeat —
// keeps flowing after the modal closes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  replace: vi.fn(),
  user: null,
  signUpWithPassword: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({
    asPath: '/',
    pathname: '/',
    replace: testState.replace,
  }),
}));
vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({
    user: testState.user,
    signInWithEmail: vi.fn(),
    signUpWithPassword: testState.signUpWithPassword,
    signInWithPassword: vi.fn(),
    verifyEmailOtp: vi.fn(),
    resendSignupEmail: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
  }),
}));
vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));
vi.mock('../src/lib/fonts', () => ({ inter: { variable: '' } }));

import SignInDialog from '../src/components/auth/SignInDialog';
import InteractionTelemetry from '../src/components/InteractionTelemetry';
import ConsentManager from '../src/components/ConsentManager';
import { track, resetAnalyticsForTests, setAnalyticsUser } from '../src/lib/analytics';
import { startSessionHeartbeat } from '../src/lib/sessionHeartbeat';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function trackBodies(fetchMock) {
  return fetchMock.mock.calls
    .filter(([url]) => url === '/api/track')
    .map(([, options]) => JSON.parse(options.body));
}

describe('client analytics survives the onboarding modal journey', () => {
  let container;
  let root;
  let fetchMock;

  beforeEach(() => {
    vi.useFakeTimers();
    window.__ieltsConsentDefault = 'granted';
    window.__ieltsOptionalConsent = null;
    window.__ieltsConsentDefaulted = true;
    window.__ieltsGaConfigured = true;
    window.gtag = vi.fn();
    fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    window.fetch = fetchMock;
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetAnalyticsForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
    delete window.__ieltsConsentDefault;
    delete window.__ieltsOptionalConsent;
    delete window.gtag;
  });

  it('keeps tracking after signup + onboarding completes', async () => {
    testState.signUpWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1', identities: [{}] }, session: { access_token: 'tok' } },
      error: null,
    });

    let setOpenExternal;
    function App() {
      const [open, setOpen] = React.useState(true);
      setOpenExternal = setOpen;
      return (
        <>
          <InteractionTelemetry />
          <ConsentManager onConsentChange={() => {}} />
          <button type="button" data-analytics-id="page_cta">Page CTA</button>
          <SignInDialog open={open} onOpenChange={setOpen} trigger="homepage_dashboard_teaser" />
        </>
      );
    }

    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    // signin_gate_shown should have been sent
    expect(trackBodies(fetchMock).map((b) => b.event)).toContain('signin_gate_shown');

    // Fill signup form
    const setInput = (selector, value) => {
      const input = document.querySelector(selector);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    setInput('#signup-first-name', 'Test');
    setInput('#signup-last-name', 'User');
    setInput('#signin-email', 'test@example.com');
    setInput('#signin-password', 'password123');

    // Submit -> auto-confirm session -> lands on the "about" step
    await act(async () => {
      document
        .querySelector('[role="dialog"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    testState.user = { id: 'user-1' };
    setAnalyticsUser('user-1', 'tok');

    // Answer onboarding: pick a goal, then "Start practising"
    const goalButton = [...document.querySelectorAll('[role="dialog"] button')].find(
      (b) => b.textContent.includes('Study abroad')
    );
    expect(goalButton).toBeTruthy();
    await act(async () => {
      goalButton.click();
      await Promise.resolve();
    });
    const startButton = [...document.querySelectorAll('[role="dialog"] button')].find(
      (b) => b.textContent.includes('Start practising')
    );
    await act(async () => {
      startButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(trackBodies(fetchMock).map((b) => b.event)).toContain('onboarding_answered');
    expect(testState.replace).toHaveBeenCalledWith('/dashboard');
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    // Flush MutationObserver microtasks for modal_close
    await act(async () => {
      await Promise.resolve();
    });

    fetchMock.mockClear();

    // Simulate the user continuing on the dashboard: a tracked click
    await act(async () => {
      document.querySelector('[data-analytics-id="page_cta"]').click();
      await Promise.resolve();
    });
    const clickEvents = trackBodies(fetchMock).map((b) => b.event);
    expect(clickEvents).toContain('ui_interaction');

    // Direct track() still works
    fetchMock.mockClear();
    track('page_view', { path: '/pricing' });
    expect(trackBodies(fetchMock).map((b) => b.event)).toContain('page_view');

    // Heartbeat still works
    fetchMock.mockClear();
    const stop = startSessionHeartbeat();
    window.dispatchEvent(new Event('pointerdown'));
    await act(async () => {
      vi.advanceTimersByTime(61_000);
      await Promise.resolve();
    });
    expect(trackBodies(fetchMock).map((b) => b.event)).toContain('session_heartbeat');
    stop();
  });
});
