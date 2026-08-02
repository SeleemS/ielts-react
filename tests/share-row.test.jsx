// @vitest-environment jsdom
// ShareRow: UTM-tagged share links for WhatsApp/Telegram/X + copy, native
// share sheet when supported, and share_click analytics on every channel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const trackSpy = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/analytics', () => ({ track: trackSpy }));

import ShareRow from '../src/components/ShareRow';

describe('ShareRow', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    trackSpy.mockClear();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
    delete navigator.share;
  });

  const render = (props) => {
    act(() => {
      root = createRoot(container);
      root.render(
        <ShareRow
          text="I scored Band 7.0 on a timed IELTS mock"
          path="/mock-test"
          source="mock_result"
          {...props}
        />
      );
    });
  };

  it('renders WhatsApp/Telegram/X links with UTM-tagged URLs and the share text', () => {
    render();
    const links = [...container.querySelectorAll('a')];
    const hrefs = links.map((a) => a.getAttribute('href'));

    const wa = hrefs.find((h) => h.startsWith('https://wa.me/'));
    expect(wa).toBeTruthy();
    const waText = decodeURIComponent(wa.split('?text=')[1]);
    expect(waText).toContain('I scored Band 7.0');
    expect(waText).toContain('https://www.ielts-bank.com/mock-test');
    expect(waText).toContain('utm_source=share');
    expect(waText).toContain('utm_medium=whatsapp');
    expect(waText).toContain('utm_campaign=mock_result');

    expect(hrefs.some((h) => h.startsWith('https://t.me/share/url'))).toBe(true);
    expect(hrefs.some((h) => h.startsWith('https://twitter.com/intent/tweet'))).toBe(true);
    // Every external link opens in a new tab with rel protection.
    links.forEach((a) => {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    });
  });

  it('tracks share_click with the channel on link click', () => {
    render();
    const wa = [...container.querySelectorAll('a')].find((a) =>
      a.getAttribute('href').startsWith('https://wa.me/')
    );
    // Stop jsdom from attempting a real navigation.
    wa.addEventListener('click', (e) => e.preventDefault());
    act(() => {
      wa.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(trackSpy).toHaveBeenCalledWith('share_click', {
      channel: 'whatsapp',
      source: 'mock_result',
    });
  });

  it('shows the native Share button only when navigator.share exists', () => {
    render();
    expect(
      [...container.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Share')
    ).toBe(false);

    navigator.share = vi.fn().mockResolvedValue();
    render();
    const native = [...container.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Share'
    );
    expect(native).toBeTruthy();
    act(() => {
      native.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(trackSpy).toHaveBeenCalledWith('share_click', {
      channel: 'native',
      source: 'mock_result',
    });
    expect(navigator.share).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'I scored Band 7.0 on a timed IELTS mock',
        url: expect.stringContaining('utm_medium=native'),
      })
    );
  });

  it('handles query strings in the target path with & instead of a second ?', () => {
    render({ path: '/blog/post?x=1' });
    const tg = [...container.querySelectorAll('a')]
      .map((a) => a.getAttribute('href'))
      .find((h) => h.startsWith('https://t.me/'));
    const url = new URL(tg).searchParams.get('url');
    expect(url).toContain('/blog/post?x=1&utm_source=share');
  });
});
