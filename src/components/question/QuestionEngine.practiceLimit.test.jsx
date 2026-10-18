// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ user: { id: 'qa-user' }, allowance: null }));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../../lib/usePracticeAllowance', () => ({ usePracticeAllowance: () => state.allowance }));
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('../../lib/progress', () => ({
  resolvePassageId: vi.fn(async () => null),
  saveAttemptToSupabase: vi.fn(async () => ({ ok: true })),
  markAttemptSynced: vi.fn(),
  syncLocalAttempts: vi.fn(async () => {}),
}));
vi.mock('../../lib/useStreak', () => ({ useStreak: () => ({ loading: true, streak: 0 }) }));
vi.mock('../auth/SignInDialog', () => ({ default: () => null }));
vi.mock('../ShareRow', () => ({ default: () => null }));
vi.mock('./WritingPromptCard', () => ({ default: () => null }));
vi.mock('next/router', () => ({ useRouter: () => ({ asPath: '/readingquestion/example' }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));

import QuestionEngine from './QuestionEngine';
import { track } from '../../lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const groups = [{ id: 'g1', questionType: 'short_answer', questions: [{ number: 1, prompt: 'River?', answerKey: { accepted: ['river'] } }] }];
let container, root;
const allowance = (over) => ({ loading: false, limited: true, canSubmit: true, remaining: 1, used: 2, limit: 3, isRetry: false, refresh: vi.fn(), ...over });

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  window.history.replaceState({}, '', '/readingquestion/example');
  window.localStorage.clear();
  state.user = { id: 'qa-user' };
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

const submit = () => {
  const button = [...container.querySelectorAll('button')].find((b) => /Submit/.test(b.textContent));
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const again = [...container.querySelectorAll('button')].find((b) => /Submit anyway/.test(b.textContent));
  if (again) act(() => again.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};

it('shows the remaining free tests and marks a passage while allowance remains', () => {
  state.allowance = allowance();
  act(() => root.render(<QuestionEngine groups={groups} storageKey="example" skill="reading" />));
  expect(container.textContent).toContain('Free plan: 1 of 3 marked practice tests left');
  submit();
  expect(container.textContent).toContain('Your results');
  expect(document.body.textContent).not.toContain('free practice tests');
});

it('blocks a new passage once the allowance is used, keeping answers and linking to a safe return', () => {
  state.allowance = allowance({ canSubmit: false, remaining: 0, used: 3 });
  act(() => root.render(<QuestionEngine groups={groups} storageKey="example" skill="reading" />));
  submit();
  expect(container.textContent).not.toContain('Your results');
  expect(document.body.textContent).toContain('You\'ve used your 3 free practice tests');
  expect(document.body.textContent).toContain('Your answers on this passage are saved');
  expect(document.body.querySelector('[data-testid="quick-checkout"]')).not.toBeNull();
  const link = [...document.body.querySelectorAll('a')].find((a) => /Compare plans/.test(a.textContent));
  const href = new URL(link.getAttribute('href'), 'https://example.test');
  expect(href.pathname).toBe('/pricing');
  expect(href.searchParams.get('upgrade')).toBe('practice');
  expect(href.searchParams.get('return_to')).toBe('/readingquestion/example');
  expect(track).toHaveBeenCalledWith('premium_gate', expect.objectContaining({ source: 'practice_limit', used: 3, limit: 3 }));
});

it('lets Pro learners and retries through without any allowance line', () => {
  state.allowance = allowance({ limited: false, canSubmit: true, remaining: Infinity });
  act(() => root.render(<QuestionEngine groups={groups} storageKey="example" skill="reading" />));
  expect(container.textContent).not.toContain('marked practice tests left');
  submit();
  expect(container.textContent).toContain('Your results');
});

it('lets the database decide when the allowance lookup failed, and shows the upgrade dialog on PT402', async () => {
  const { saveAttemptToSupabase, resolvePassageId } = await import('../../lib/progress');
  resolvePassageId.mockResolvedValueOnce('passage-4');
  saveAttemptToSupabase.mockResolvedValueOnce({ ok: false, practiceLimit: true, error: { code: 'PT402' } });
  state.allowance = allowance({ limited: false, canSubmit: true, remaining: Infinity, uncertain: true });
  act(() => root.render(<QuestionEngine groups={groups} storageKey="example" skill="reading" />));
  submit();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(saveAttemptToSupabase).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain('Your results');
  expect(document.body.textContent).toContain('free practice tests');
  expect(track).toHaveBeenCalledWith('premium_gate', expect.objectContaining({ source: 'practice_limit_server' }));
});

it('shows results after the database accepts an uncertain submission, without saving twice', async () => {
  const { saveAttemptToSupabase } = await import('../../lib/progress');
  state.allowance = allowance({ limited: false, canSubmit: true, remaining: Infinity, uncertain: true });
  act(() => root.render(<QuestionEngine groups={groups} storageKey="example" skill="reading" />));
  submit();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(container.textContent).toContain('Your results');
  expect(saveAttemptToSupabase).toHaveBeenCalledTimes(1);
});
