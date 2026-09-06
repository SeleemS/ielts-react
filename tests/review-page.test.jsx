// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ skill: 'reading', query: {}, replaces: [], engineProps: null }));
vi.mock('next/head', () => ({ default: () => null }));
vi.mock('next/link', () => ({ default: ({ href, children }) => <a href={href}>{children}</a> }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: state.query, replace: async (...args) => { state.replaces.push(args); } }) }));
vi.mock('../src/lib/auth', () => ({ useAuth: () => ({ user: { id: 'qa-user' }, loading: false }) }));
vi.mock('../src/lib/analytics', () => ({ track: () => {} }));
vi.mock('../src/components/Navbar', () => ({ default: () => null }));
vi.mock('../src/components/Footer', () => ({ default: () => null }));
vi.mock('../src/components/auth/SignInDialog', () => ({ default: () => null }));
vi.mock('../src/components/question/AudioPlayer', () => ({ default: ({ src }) => <audio data-testid="review-audio" src={src} /> }));
vi.mock('../src/components/question/QuestionEngine', () => ({ default: props => { state.engineProps = props; return <div>Review inputs</div>; } }));
vi.mock('../lib/supabase', () => ({
  getStructuredPassage: async () => ({ bodyHtml: '<p>Source context for the answer.</p><script>window.unsafe = true</script>', audioUrl: '/listening-fixture.mp3', groups: [
    { id: 'g1', questionType: 'true_false_not_given', questions: [{ number: 1 }, { number: 2 }] },
  ] }),
  getSupabase: () => { const query = { from: () => query, select: () => query, in: () => query, order: () => query,
    limit: async () => ({ data: [{ id: 'attempt1', skill: state.skill, passages: { slug: 'compost', title: 'Composting' }, per_question: { 1: { correct: false }, 2: { correct: true } } }], error: null }) }; return query; },
}));
import ReviewPage from '../pages/review';
let root, container;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { state.skill = 'reading'; state.query = { passage: 'compost', source: 'dashboard' }; state.replaces = []; state.engineProps = null; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
describe('review source context and navigation', () => {
  it('shows sanitized passage context and only the missed source-numbered input', async () => {
    await act(async () => root.render(<ReviewPage />));
    expect(container.textContent).toContain('Reading passage');
    expect(container.textContent).toContain('Source context for the answer.');
    expect(container.querySelector('script')).toBeNull();
    expect(state.engineProps).toMatchObject({ storageKey: 'compost', reviewMode: true, showBand: false });
    expect(state.engineProps.groups[0].questions.map(q => q.number)).toEqual([1]);
  });
  it('reuses the listening player with the source recording', async () => {
    state.skill = 'listening';
    await act(async () => root.render(<ReviewPage />));
    expect(container.querySelector('audio').getAttribute('src')).toBe('/listening-fixture.mp3');
  });
  it('Back clears the passage deep link and does not reopen it while replacement is pending', async () => {
    await act(async () => root.render(<ReviewPage />));
    await act(async () => Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Back to your review queue')).click());
    expect(state.replaces[0]).toEqual([{ pathname: '/review', query: { source: 'dashboard' } }, undefined, { shallow: true }]);
    expect(container.textContent).toContain('1 question to clear');
    expect(container.textContent).not.toContain('Review inputs');
  });
});
