// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
import ExamPassOffer from './ExamPassOffer';
import { track } from '../lib/analytics';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root, observed, disconnect;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', class { constructor(callback) { observed = callback; } observe() {} disconnect() { disconnect(); } });
  window.history.replaceState({}, '', '/writingquestion/example-task');
  document.cookie = 'ib_country=US; path=/';
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it('offers one regional pass with a safe contextual return and no recurring price', () => {
  document.cookie = 'ib_country=EG; path=/';
  act(() => root.render(<ExamPassOffer skill="writing" source="score_tease" band={6} />));
  expect(container.textContent).toContain('$5.99 USD');
  expect(container.textContent).toContain('No automatic renewal');
  expect(container.textContent).toContain('on your next essays');
  const links = container.querySelectorAll('a'); expect(links).toHaveLength(1);
  const href = new URL(links[0].href);
  expect(href.searchParams.get('return_to')).toBe('/writingquestion/example-task');
  expect(href.searchParams.get('stage')).toBe('sample');
  links[0].addEventListener('click', event => event.preventDefault());
  act(() => links[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  expect(track).toHaveBeenCalledWith('exam_pass_offer_click', expect.objectContaining({ sku: 'exam_pass', skill: 'writing', offer_version: 'exam_pass_v1' }));
});
it('uses global pricing and records exposure once only when the offer is visible', () => {
  act(() => root.render(<ExamPassOffer skill="speaking" source="speaking_sample" />));
  expect(container.textContent).toContain('$14.99 USD');
  expect(track).not.toHaveBeenCalled();
  observed([{ isIntersecting: false }]); expect(track).not.toHaveBeenCalled();
  observed([{ isIntersecting: true, intersectionRatio: 0.5 }]); observed([{ isIntersecting: true, intersectionRatio: 0.5 }]);
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith('exam_pass_offer_view', expect.objectContaining({ skill: 'speaking', stage: 'sample' }));
  expect(disconnect).toHaveBeenCalled();
});
