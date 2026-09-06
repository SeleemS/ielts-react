// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: [], failInsert: false, tracks: [] }));
vi.mock('next/link', () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock('next/router', () => ({ useRouter: () => ({ asPath: '/review' }) }));
vi.mock('../src/lib/auth', () => ({ useAuth: () => ({ user: { id: 'qa-user' } }) }));
vi.mock('../src/lib/analytics', () => ({ track: (...args) => state.tracks.push(args) }));
vi.mock('../src/lib/useStreak', () => ({ useStreak: () => ({ loading: false, streak: 0 }) }));
vi.mock('../src/components/mock/scoreAnimation', () => ({ usePlayOnMount: () => false, usePrefersReducedMotion: () => true }));
vi.mock('../src/components/NewsletterSignup', () => ({ default: () => null }));
vi.mock('../src/components/auth/SignInDialog', () => ({ default: () => null }));
vi.mock('../src/components/ShareRow', () => ({ default: () => null }));
vi.mock('../src/components/question/WritingPromptCard', () => ({ default: () => null }));
vi.mock('../src/components/question/QuestionGroup', () => ({ default: ({ group, onChange }) => (
  <div>{group.questions.map(q => <button key={q.number} onClick={() => onChange(q.number, 'TRUE')}>Answer {q.number}</button>)}</div>
) }));
vi.mock('../lib/supabase', () => ({ getSupabase: () => ({ from: table => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: 'passage-uuid' }, error: null }),
    insert: async row => {
      if (state.failInsert) return { error: new Error('offline') };
      state.rows.push({ table, ...row });
      return { error: null };
    } };
  return query;
} }) }));
import QuestionEngine from '../src/components/question/QuestionEngine';
import { selectReviewGroups } from '../src/lib/reviewQueue';
import { syncLocalAttempts } from '../src/lib/progress';

const source = { groups: [{ id: 'one', questionType: 'true_false_not_given', questions: [1, 2, 3, 4, 5, 6].map(number => ({ number, answerKey: { accepted: ['TRUE'] } })) }] };
const originalDraft = JSON.stringify({ answers: { 2: 'FALSE' }, startedAt: '2026-09-01T00:00:00Z' });
const originalAttempt = JSON.stringify({ skill: 'reading', slug: 'compost', score: 9, total: 10, timestamp: 'baseline' });
let root, container;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  state.rows = []; state.tracks = []; state.failInsert = false;
  localStorage.clear();
  localStorage.setItem('ielts-inprogress:reading:compost', originalDraft);
  localStorage.setItem('ielts-attempt:reading:compost', originalAttempt);
  localStorage.setItem('ielts-attempts-synced', JSON.stringify({ 'ielts-attempt:reading:compost': 'baseline' }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); });
async function submitReview(missed = [1]) {
  await act(async () => root.render(<QuestionEngine groups={selectReviewGroups(source, missed)} storageKey="compost" skill="reading" showBand={false} reviewMode />));
  expect(container.textContent).toContain(`0 / ${missed.length} answered`);
  for (const number of missed) await act(async () => Array.from(container.querySelectorAll('button')).find(b => b.textContent === `Answer ${number}`).click());
  await act(async () => Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Submit answers').click());
}

describe('review persistence integrity', () => {
  it('grades only missed inputs, appends a null-band review and preserves full practice local data', async () => {
    await submitReview();
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({ table: 'attempts', passage_id: 'passage-uuid', raw_score: 1, total: 1, band: null, responses: { 1: 'TRUE', _practiceMode: 'review' } });
    expect(Object.keys(state.rows[0].per_question)).toEqual(['1']);
    expect(localStorage.getItem('ielts-inprogress:reading:compost')).toBe(originalDraft);
    expect(localStorage.getItem('ielts-attempt:reading:compost')).toBe(originalAttempt);
    const saved = JSON.parse(localStorage.getItem('ielts-attempt:reading:review:compost'));
    expect(saved).toMatchObject({ slug: 'compost', band: null, score: 1, total: 1 });
    expect(state.tracks.find(([event]) => event === 'attempt_submit')[1]).toMatchObject({ band: null, practice_mode: 'review', total: 1 });
  });
  it('keeps review band null during later offline sync, even for a six-question review', async () => {
    state.failInsert = true;
    await submitReview([1, 2, 3, 4, 5, 6]);
    expect(state.rows).toHaveLength(0);
    state.failInsert = false;
    expect(await syncLocalAttempts('qa-user')).toMatchObject({ synced: 1, skipped: 1 });
    expect(state.rows[0]).toMatchObject({ passage_id: 'passage-uuid', raw_score: 6, total: 6, band: null, responses: { _practiceMode: 'review' } });
  });
});
