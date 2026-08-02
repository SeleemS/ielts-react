// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { OPTIONAL_CONSENT_KEY } from '../lib/consent';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('../lib/analytics', () => ({
  track: vi.fn(),
}));

import ConsentManager from './ConsentManager';
import { track } from '../lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Consent clicks within this window of the banner appearing (or of a modal
// closing) are treated as accidental and ignored — keep in sync with the
// component's ACCIDENT_GUARD_MS.
const GUARD_MS = 750;

let container;
let root;

async function renderManager(onConsentChange = vi.fn()) {
  await act(async () => {
    root.render(<ConsentManager onConsentChange={onConsentChange} />);
    await Promise.resolve();
  });
  return onConsentChange;
}

function clickButton(label) {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent.trim() === label
  );
  expect(button).toBeTruthy();
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function settle() {
  // Move past the accidental-click guard window.
  act(() => {
    vi.advanceTimersByTime(GUARD_MS + 50);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  window.__ieltsOptionalConsent = null;
  Object.defineProperty(window.navigator, 'globalPrivacyControl', {
    configurable: true,
    value: false,
  });
  window.gtag = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete window.gtag;
  delete window.__ieltsOptionalConsent;
  delete window.navigator.globalPrivacyControl;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ConsentManager', () => {
  it('shows a first-visit choice and honors reject then accept updates', async () => {
    const onConsentChange = await renderManager();
    expect(container.textContent).toContain('Your privacy choices');

    settle();
    clickButton('Reject optional cookies');
    expect(window.localStorage.getItem(OPTIONAL_CONSENT_KEY)).toBe('denied');
    expect(onConsentChange).toHaveBeenLastCalledWith('denied');
    expect(window.gtag).toHaveBeenLastCalledWith(
      'consent',
      'update',
      expect.objectContaining({
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      })
    );
    expect(container.textContent).toContain('Privacy choices');

    clickButton('Privacy choices');
    settle();
    clickButton('Accept optional cookies');
    expect(window.localStorage.getItem(OPTIONAL_CONSENT_KEY)).toBe('granted');
    expect(onConsentChange).toHaveBeenLastCalledWith('granted');
    expect(window.gtag).toHaveBeenLastCalledWith(
      'consent',
      'update',
      expect.objectContaining({
        analytics_storage: 'granted',
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
      })
    );
  });

  it('records the explicit choice as a final first-party consent_updated event', async () => {
    await renderManager();
    settle();

    clickButton('Reject optional cookies');
    // The opt-out marker must be emitted BEFORE the choice is persisted, or a
    // rejected visitor's event stream just stops dead with no explanation.
    expect(track).toHaveBeenCalledWith(
      'consent_updated',
      { choice: 'denied' },
      { firstPartyOnly: true }
    );

    track.mockClear();
    clickButton('Privacy choices');
    settle();
    clickButton('Accept optional cookies');
    expect(track).toHaveBeenCalledWith(
      'consent_updated',
      { choice: 'granted' },
      { firstPartyOnly: true }
    );
  });

  it('ignores a choice that lands right after the banner appears', async () => {
    const onConsentChange = await renderManager();

    // No settle(): this click arrives inside the accidental-click window.
    clickButton('Reject optional cookies');

    expect(window.localStorage.getItem(OPTIONAL_CONSENT_KEY)).toBeNull();
    expect(onConsentChange).not.toHaveBeenCalled();
    // The banner stays up so a considered choice can still be made.
    expect(container.textContent).toContain('Reject optional cookies');

    settle();
    clickButton('Reject optional cookies');
    expect(window.localStorage.getItem(OPTIONAL_CONSENT_KEY)).toBe('denied');
  });

  it('ignores a choice while a modal is open or just after it closes', async () => {
    const onConsentChange = await renderManager();
    settle();

    // An app dialog (e.g. the sign-in/onboarding modal) covers the page.
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    await act(async () => {
      document.body.appendChild(modal);
      await Promise.resolve(); // flush the MutationObserver microtask
      await Promise.resolve();
    });

    clickButton('Reject optional cookies');
    expect(window.localStorage.getItem(OPTIONAL_CONSENT_KEY)).toBeNull();
    expect(onConsentChange).not.toHaveBeenCalled();

    // The modal closes — the very next tap is aimed at UI that just vanished,
    // not at a permanent privacy opt-out.
    await act(async () => {
      modal.remove();
      await Promise.resolve();
      await Promise.resolve();
    });
    clickButton('Reject optional cookies');
    expect(window.localStorage.getItem(OPTIONAL_CONSENT_KEY)).toBeNull();
    expect(onConsentChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Reject optional cookies');

    // A deliberate choice after the grace window still goes through.
    settle();
    clickButton('Reject optional cookies');
    expect(window.localStorage.getItem(OPTIONAL_CONSENT_KEY)).toBe('denied');
    expect(onConsentChange).toHaveBeenLastCalledWith('denied');
  });

  it('restores a saved denial without reopening the banner', async () => {
    window.localStorage.setItem(OPTIONAL_CONSENT_KEY, 'denied');

    await renderManager();

    expect(container.textContent).not.toContain('Reject optional cookies');
    expect(container.textContent).toContain('Privacy choices');
    expect(window.gtag).toHaveBeenCalledWith(
      'consent',
      'update',
      expect.objectContaining({ analytics_storage: 'denied' })
    );
  });

  it('keeps analytics denied when Global Privacy Control is enabled', async () => {
    Object.defineProperty(window.navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    });
    window.localStorage.setItem(OPTIONAL_CONSENT_KEY, 'granted');

    await renderManager();

    expect(container.textContent).not.toContain('Accept optional cookies');
    expect(container.textContent).toContain('Privacy choices');
    expect(window.gtag).toHaveBeenCalledWith(
      'consent',
      'update',
      expect.objectContaining({
        analytics_storage: 'denied',
        ad_storage: 'denied',
      })
    );
  });
});
