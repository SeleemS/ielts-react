// @vitest-environment jsdom
// The Band Estimator's conversion gate: an anonymous visitor who wrote a sample
// sees their Reading/Listening bands but NOT the Writing band or the overall —
// those are the sign-up reward, withheld by the API (never present client-side).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const state = {
  user: null,
  isPremium: false,
  planLoading: false,
  planError: null,
  sessionResult: {
    data: { session: { access_token: 'tok' } },
    error: null,
  },
  sessionReject: null,
};

vi.mock('../../lib/analytics', () => ({
  track: vi.fn(),
  getAnonId: () => '11111111-1111-4111-8111-111111111111',
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../../lib/usePlan', () => ({
  usePlan: () => ({
    isPremium: state.isPremium,
    loading: state.planLoading,
    error: state.planError,
  }),
}));
vi.mock('../auth/SignInDialog', () => ({ default: () => null }));
vi.mock('../NewsletterSignup', () => ({ default: () => null }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) => React.createElement('a', { href, ...rest }, children),
}));
vi.mock('../../../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => {
        if (state.sessionReject) throw state.sessionReject;
        return state.sessionResult;
      },
    },
  }),
}));

import EstimatorResults from './EstimatorResults';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

const baseProps = {
  reading: { raw: 7, total: 10, band: 6.5 },
  listening: { raw: 6, total: 10, band: 6 },
  speaking: { points: 4, band: { min: 6, max: 7 } },
  skipped: {},
  initialTargetBand: 7,
};

beforeEach(() => {
  state.user = null;
  state.isPremium = false;
  state.planLoading = false;
  state.planError = null;
  state.sessionResult = {
    data: { session: { access_token: 'tok' } },
    error: null,
  };
  state.sessionReject = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete global.fetch;
  vi.clearAllMocks();
});

async function flush() {
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
}

describe('EstimatorResults writing gate', () => {
  it('withholds the Writing band and the overall from an anonymous visitor', () => {
    act(() => {
      root.render(<EstimatorResults {...baseProps} writing={{ locked: true }} overall={null} />);
    });

    // Measured Reading/Listening are shown as proof of value.
    expect(container.textContent).toContain('6.5');
    // The gate is explicit, and the overall is not rendered.
    expect(container.textContent).toContain('Your overall band is ready');
    expect(container.textContent).toContain('Reveal my band');
    expect(container.textContent).toContain('Locked');
    // The plan is part of the account reward, so it is not shown yet.
    expect(container.textContent).not.toMatch(/Your plan to reach/i);
  });

  it('reveals the Writing band and overall once signed in', async () => {
    state.user = { id: 'user-1' };
    const onWritingRevealed = vi.fn();
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        band: 6,
        wordCount: 104,
        criteria: {
          taskResponse: {
            band: 6,
            strengths: ['A clear position'],
            improvements: ['Develop the example'],
          },
        },
        lockedIssueCount: 5,
        premium: false,
      }),
    }));

    act(() => {
      root.render(
        <EstimatorResults
          {...baseProps}
          writing={{ locked: true }}
          overall={null}
          onWritingRevealed={onWritingRevealed}
        />
      );
    });
    await flush();

    expect(global.fetch).toHaveBeenCalledWith('/api/estimator/reveal', expect.anything());
    // Writing band is now shown, the lock is gone, and the plan appears.
    expect(container.textContent).toContain('indicative');
    expect(container.textContent).not.toContain('Reveal my band');
    expect(container.textContent).toMatch(/Your plan to reach/i);
    expect(container.textContent).toContain('Your Writing feedback');
    expect(container.textContent).toContain('A clear position');
    expect(container.textContent).toContain('Coherence & Cohesion');
    expect(container.textContent).toContain('See the 30-day Exam Pass');
    expect(container.textContent).toContain('on your next essays');
    expect(container.textContent).not.toContain('essay has 5 fixable issues');
    expect(onWritingRevealed).toHaveBeenCalledWith({ band: 6, overall: 6.5 });
  });

  it('does not misreport an auth outage and allows a manual reveal retry', async () => {
    state.user = { id: 'user-1' };
    state.sessionResult = {
      data: { session: null },
      error: new Error('auth unavailable'),
    };
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        band: 6,
        wordCount: 104,
        criteria: { taskResponse: { band: 6 } },
        lockedIssueCount: 0,
        premium: false,
      }),
    }));

    act(() => {
      root.render(<EstimatorResults {...baseProps} writing={{ locked: true }} overall={null} />);
    });
    await flush();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      'Could not verify your session. Please refresh and try again.'
    );
    expect(container.textContent).toContain('Reveal my band');

    state.sessionResult = {
      data: { session: { access_token: 'recovered-token' } },
      error: null,
    };
    const retryButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Reveal my band')
    );
    await act(async () => {
      retryButton.click();
    });
    await flush();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/estimator/reveal',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer recovered-token' }),
      })
    );
    expect(container.textContent).not.toContain('Reveal my band');
  });

  it('renders the complete estimator Writing report for Premium', async () => {
    state.user = { id: 'user-1' };
    state.isPremium = true;
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        band: 7,
        wordCount: 102,
        criteria: {
          taskResponse: { band: 7, strengths: ['Clear position'], improvements: ['Develop one example'] },
          coherenceCohesion: { band: 7, strengths: ['Logical flow'], improvements: ['Vary transitions'] },
          lexicalResource: { band: 7, strengths: ['Precise vocabulary'], improvements: ['Check collocation'] },
          grammaticalRange: { band: 7, strengths: ['Complex sentences'], improvements: ['Check articles'] },
        },
        summary: 'A controlled short response.',
        improvements: ['Prioritise precision.'],
        correctedExamples: [
          { original: 'student uses phones', suggestion: 'students use phones' },
        ],
        premium: true,
      }),
    }));

    act(() => {
      root.render(<EstimatorResults {...baseProps} writing={{ locked: true }} overall={null} />);
    });
    await flush();

    expect(container.textContent).toContain('Precise vocabulary');
    expect(container.textContent).toContain('A controlled short response.');
    expect(container.textContent).toContain('students use phones');
    expect(container.textContent).not.toContain('Unlock full feedback — Premium');
  });

  it('withholds Free conversion copy until a signed-in Premium plan is verified', () => {
    state.user = { id: 'user-1' };
    state.planLoading = true;
    act(() => {
      root.render(
        <EstimatorResults {...baseProps} writing={{ points: 3, band: { min: 5.5, max: 6.5 } }} overall={6} />
      );
    });

    expect(container.textContent).toContain('Checking your plan…');
    expect(container.textContent).not.toContain('Get your real Writing band');
    expect(container.textContent).not.toContain('Meet the AI examiner');

    state.planLoading = false;
    state.isPremium = true;
    act(() => {
      root.render(
        <EstimatorResults {...baseProps} writing={{ points: 3, band: { min: 5.5, max: 6.5 } }} overall={6} />
      );
    });

    expect(container.textContent).not.toContain('Checking your plan…');
    expect(container.textContent).toContain('Score your writing');
    expect(container.textContent).toContain('Meet your examiner');
    expect(container.textContent).not.toContain('Get your real Writing band');
  });

  it('does not turn a plan lookup error into verified-Free conversion copy', () => {
    state.user = { id: 'user-1' };
    state.planError = 'Could not verify your current plan. Please refresh and try again.';
    act(() => {
      root.render(
        <EstimatorResults {...baseProps} writing={{ points: 3, band: { min: 5.5, max: 6.5 } }} overall={6} />
      );
    });

    expect(container.textContent).toContain('Your plan could not be verified');
    expect(container.textContent).toContain(state.planError);
    expect(container.textContent).not.toContain('Get your real Writing band');
    expect(container.textContent).not.toContain('Meet the AI examiner');
  });

  it('still shows a self-assessed range when the visitor skipped the sample', () => {
    act(() => {
      root.render(
        <EstimatorResults {...baseProps} writing={{ points: 3, band: { min: 5.5, max: 6.5 } }} overall={6} />
      );
    });
    expect(container.textContent).toContain('Self-assessed');
    expect(container.textContent).not.toContain('Reveal my band');
  });
});
