// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const auth = vi.hoisted(() => ({ user: { id: 'qa-user', is_anonymous: false } }));
vi.mock('../lib/analytics', () => ({ track: vi.fn(), gaClientId: () => 'ga-1' }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('../lib/sessionAccess', () => ({ getSessionAccess: vi.fn(async () => ({ accessToken: 'token-1' })) }));
vi.mock('../../lib/supabase', () => ({ getSupabase: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
import ExamPassOffer, { lockedValueLines, perDay } from './ExamPassOffer';
import { track } from '../lib/analytics';
import { OFFER_VERSION } from '../../lib/monetizationExperiment';
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

const buttons = () => [...container.querySelectorAll('[data-testid="quick-checkout"] button')];

it('offers every plan as a one-click checkout at regional prices, with the pass-first copy', () => {
  document.cookie = 'ib_country=EG; path=/';
  act(() => root.render(<ExamPassOffer skill="writing" source="score_tease" band={6} locked={{ corrections: 4, rewrite: true }} />));
  expect(buttons().map((b) => b.dataset.sku)).toEqual(['exam_pass', 'monthly']);
  expect(container.textContent).toContain('$5.99');
  expect(container.textContent).toContain('$3.99/mo');
  expect(container.textContent).toContain('about $0.20 a day');
  expect(container.textContent).toContain('Get the full report on your next essay');
  expect(container.textContent).toContain('this essay had 4 more we held back');
  expect(container.textContent).toContain('14-day money-back guarantee');
  expect(container.textContent).toContain('this free sample stays as it is');
  expect(container.textContent).toContain('Illustrative excerpt');
  const compare = new URL(container.querySelector('a').href, 'https://example.test');
  expect(compare.pathname).toBe('/pricing');
  expect(compare.searchParams.get('return_to')).toBe('/writingquestion/example-task');
  expect(compare.searchParams.get('stage')).toBe('sample');
});

it('goes straight to Stripe when a signed-in learner picks a plan', async () => {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign, pathname: '/writingquestion/example-task' });
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test' }) }));
  vi.stubGlobal('fetch', fetchMock);
  act(() => root.render(<ExamPassOffer skill="writing" source="score_tease" band={6} />));
  await act(async () => {
    buttons()[0].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/billing/checkout');
  expect(init.headers.Authorization).toBe('Bearer token-1');
  expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ sku: 'exam_pass', upgrade: 'writing', stage: 'sample' }));
  expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test');
  expect(track).toHaveBeenCalledWith('checkout_start', expect.objectContaining({ sku: 'exam_pass', direct: true, source: 'score_tease' }));
});

it('sends signed-out learners to pricing with the same context', async () => {
  auth.user = null;
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  vi.stubGlobal('fetch', vi.fn());
  act(() => root.render(<ExamPassOffer skill="writing" source="score_tease" band={6} />));
  await act(async () => {
    buttons()[1].click();
    await Promise.resolve();
  });
  expect(fetch).not.toHaveBeenCalled();
  const target = new URL(assign.mock.calls[0][0], 'https://example.test');
  expect(target.pathname).toBe('/pricing');
  expect(target.searchParams.get('upgrade')).toBe('writing');
  expect(target.hash).toBe('#monthly');
  auth.user = { id: 'qa-user', is_anonymous: false };
});

it('shows a server refusal without leaving the page', async () => {
  vi.stubGlobal('location', { ...window.location, assign: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: 'Your Exam Pass is already active.' }) })));
  act(() => root.render(<ExamPassOffer skill="writing" source="score_tease" band={6} />));
  await act(async () => {
    buttons()[0].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(container.querySelector('[role="alert"]').textContent).toContain('Your Exam Pass is already active.');
});

it('uses global pricing and records exposure once only when the offer is visible', () => {
  act(() => root.render(<ExamPassOffer skill="speaking" source="speaking_sample" />));
  expect(container.textContent).toContain('$14.99');
  expect(container.textContent).toContain('$8.99/mo');
  expect(container.textContent).toContain('on your next recording');
  const views = () => track.mock.calls.filter(([event]) => event === 'exam_pass_offer_view');
  expect(views()).toHaveLength(0);
  observed([{ isIntersecting: false }]); expect(views()).toHaveLength(0);
  observed([{ isIntersecting: true, intersectionRatio: 0.5 }]); observed([{ isIntersecting: true, intersectionRatio: 0.5 }]);
  expect(views()).toHaveLength(1);
  expect(track).toHaveBeenCalledWith('exam_pass_offer_view', expect.objectContaining({ skill: 'speaking', stage: 'sample' }));
  expect(disconnect).toHaveBeenCalled();
});

it('only states withheld counts that the free payload actually reported', () => {
  const generic = lockedValueLines('writing');
  expect(generic[0]).toBe('Band and feedback on all four criteria');
  expect(generic[1]).toBe('Every corrected sentence, not just the first');
  expect(generic.join(' ')).not.toMatch(/this essay/);
  const specific = lockedValueLines('writing', { corrections: 3, rewrite: true });
  expect(specific[1]).toContain('this essay had 3 more');
  expect(specific[2]).toContain('one was written for this essay');
  expect(lockedValueLines('writing', { corrections: -1 })[1]).toBe('Every corrected sentence, not just the first');
});

it('computes a plain per-day cost', () => {
  expect(perDay(14.99, 30)).toBe('$0.50');
  expect(perDay(5.99, 30)).toBe('$0.20');
  expect(perDay(14.99, 45)).toBe('$0.33');
  expect(perDay(Number.NaN, 30)).toBeNull();
});

it('offers the current report only when a valid saved report ID exists', () => {
  act(() => root.render(<ExamPassOffer skill="writing" source="score_tease" reportId="10000000-0000-4000-8000-000000000001" />));
  expect(container.textContent).toContain('Unlock the full feedback on this essay');
  expect(container.textContent).not.toContain('this free sample stays');
  const href = new URL(container.querySelector('a').href);
  expect(href.searchParams.get('return_to')).toBe('/writing-report/10000000-0000-4000-8000-000000000001');
  expect(container.textContent).toContain('Every plan unlocks this saved report');
  observed([{ isIntersecting: true, intersectionRatio: 0.5 }]);
  expect(track).toHaveBeenCalledWith('exam_pass_offer_view', expect.objectContaining({ offer_version: 'current_report_v4' }));
});
