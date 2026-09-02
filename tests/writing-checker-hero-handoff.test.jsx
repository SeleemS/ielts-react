// @vitest-environment jsdom
// The homepage hero hands a pasted essay to /ielts-writing-checker, which must
// pre-fill the form AND continue straight into the existing flow. Everything is
// rendered inside <StrictMode> because the app runs with reactStrictMode: true —
// its double-invoked mount effects previously wiped the handed-off essay.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  user: null,
  authLoading: false,
  pushed: [],
}));

vi.mock('next/head', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('next/router', () => ({
  useRouter: () => ({
    isReady: true,
    query: {},
    push: (url) => {
      testState.pushed.push(url);
      return Promise.resolve(true);
    },
  }),
}));
vi.mock('../src/components/Navbar', () => ({ default: () => React.createElement('nav') }));
vi.mock('../src/components/Footer', () => ({ default: () => React.createElement('footer') }));
vi.mock('../src/components/NewsletterSignup', () => ({ default: () => null }));
vi.mock('../src/components/AiQuotaPanel', () => ({ default: () => null }));
vi.mock('../src/components/question/FreeSampleChip', () => ({ default: () => null }));
vi.mock('../src/components/question/WritingScoreReport', () => ({
  default: () => React.createElement('div', null, 'report'),
}));
vi.mock('../src/components/question/ScoreUI', () => ({
  ScoringProgress: () => React.createElement('div', null, 'scoring'),
}));
vi.mock('../src/components/auth/SignInDialog', () => ({
  default: ({ open }) =>
    open ? React.createElement('div', { 'data-testid': 'sign-in-dialog' }, 'Sign in') : null,
}));
vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({ user: testState.user, loading: testState.authLoading }),
}));
vi.mock('../src/lib/progress', () => ({ saveAttemptToSupabase: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabase: () => ({}) }));
vi.mock('../src/lib/sessionAccess', () => ({
  getSessionAccess: async () => ({ accessToken: null, error: null }),
}));
vi.mock('../src/lib/analytics', () => ({
  track: vi.fn(),
  getAnonId: () => null,
}));

import WritingCheckerPage from '../pages/ielts-writing-checker';
import { saveWritingDraft, WRITING_DRAFT_KEY } from '../src/lib/writingDraft';
import { track } from '../src/lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LONG_ESSAY =
  'Many people argue that technology has fundamentally improved the quality of modern life while others believe it has created serious new problems that outweigh its benefits for ordinary citizens today. '.repeat(
    10
  );

let container;
let root;

function render() {
  act(() => {
    root.render(React.createElement(React.StrictMode, null, React.createElement(WritingCheckerPage)));
  });
}

beforeEach(() => {
  testState.user = null;
  testState.authLoading = false;
  testState.pushed = [];
  window.localStorage.clear();
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('writing checker hero handoff', () => {
  it('pre-fills from the hero draft and continues into the sign-in gate', () => {
    saveWritingDraft({
      taskType: 'task1-academic',
      prompt: 'The chart below shows household energy use.',
      essay: LONG_ESSAY,
    });

    render();

    expect(container.querySelector('#essay').value).toBe(LONG_ESSAY);
    expect(container.querySelector('#prompt').value).toBe(
      'The chart below shows household energy use.'
    );
    expect(container.querySelector('#task-type').value).toBe('task1-academic');
    // The handoff is one-shot: a refresh must not silently re-score.
    expect(window.sessionStorage.getItem(WRITING_DRAFT_KEY)).toBeNull();
    // Auto-continue reached the existing signed-out gate without a second click.
    expect(container.querySelector('[data-testid="sign-in-dialog"]')).toBeTruthy();
    expect(track).toHaveBeenCalledWith(
      'premium_gate',
      expect.objectContaining({ skill: 'writing', slug: 'writing-checker', stage: 'signup' })
    );
  });

  it('lets the hero handoff win over an older stored draft', () => {
    // The page's own draft survives from an earlier visit. Under StrictMode the
    // restore effect runs twice; the second pass must not fall back to it and
    // overwrite the essay the hero just handed over.
    window.localStorage.setItem(
      'ielts-writing-checker-draft',
      JSON.stringify({ taskType: 'task2', prompt: 'Older prompt', essay: 'Older essay text' })
    );
    saveWritingDraft({ taskType: 'task2', prompt: 'Hero prompt', essay: LONG_ESSAY });

    render();

    expect(container.querySelector('#essay').value).toBe(LONG_ESSAY);
    expect(container.querySelector('#prompt').value).toBe('Hero prompt');
  });

  it('surfaces the word-count rule instead of scoring a too-short handoff', () => {
    saveWritingDraft({ taskType: 'task2', essay: 'Technology is good for people.' });

    render();

    expect(container.querySelector('#essay').value).toBe('Technology is good for people.');
    expect(container.textContent).toContain('must be at least 250 words');
    expect(container.querySelector('[data-testid="sign-in-dialog"]')).toBeFalsy();
  });

  it('does not overwrite the stored draft with empty initial state', () => {
    window.localStorage.setItem(
      'ielts-writing-checker-draft',
      JSON.stringify({ taskType: 'task2', prompt: 'Saved prompt', essay: 'Saved essay text' })
    );

    render();

    expect(container.querySelector('#essay').value).toBe('Saved essay text');
    expect(container.querySelector('#prompt').value).toBe('Saved prompt');
    // No handoff means no automatic submission.
    expect(container.querySelector('[data-testid="sign-in-dialog"]')).toBeFalsy();
    expect(JSON.parse(window.localStorage.getItem('ielts-writing-checker-draft')).essay).toBe(
      'Saved essay text'
    );
  });
});
