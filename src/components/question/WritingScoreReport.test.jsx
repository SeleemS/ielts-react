// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));

import WritingScoreReport from './WritingScoreReport';
import { track } from '../../lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

const result = {
  overallBand: 6,
  wordCount: 276,
  free: true,
  criteria: {
    taskResponse: {
      band: 6,
      strengths: ['A clear position'],
      improvements: ['Develop the second idea'],
    },
    coherenceCohesion: {
      band: 6,
      strengths: ['Logical paragraphs'],
      improvements: ['Use references more precisely'],
    },
    lexicalResource: {
      band: 6,
      strengths: ['Relevant vocabulary'],
      improvements: ['Avoid repetition'],
    },
    grammaticalRange: {
      band: 5.5,
      strengths: ['Some complex sentences'],
      improvements: ['Check agreement'],
    },
  },
  summary: 'A relevant response with several fixable control issues.',
  improvements: ['Add a more specific example.'],
  correctedExamples: [
    { original: 'People is affected.', suggestion: 'People are affected.' },
    { original: 'In nowadays society.', suggestion: 'In society today.' },
    { original: 'They was late.', suggestion: 'They were late.' },
  ],
  rewrite: {
    focus: 'Second body paragraph — undeveloped example',
    text: 'A band eight version of the second body paragraph goes here.',
  },
};

// What the API actually sends a free user (see reduceForFree in
// pages/api/score/writing.js): every criterion band, ONE real correction, and
// counts — never the withheld strings.
const freeResult = {
  overallBand: result.overallBand,
  wordCount: result.wordCount,
  free: true,
  criteria: result.criteria,
  correctedExamples: [result.correctedExamples[0]],
  lockedCorrectionCount: 2,
  rewriteLocked: true,
  lockedIssueCount: 11,
};

function render(element) {
  act(() => {
    root.render(element);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('WritingScoreReport free-score preview', () => {
  it('shows all four criterion bands plus ONE real correction, and masks the rest', () => {
    render(<WritingScoreReport task={2} result={freeResult} />);

    const headings = [...container.querySelectorAll('h3')].map((node) => node.textContent);
    expect(headings).toContain('Task Response');
    expect(headings).toContain('Coherence & Cohesion');
    expect(headings).toContain('Lexical Resource');
    expect(headings).toContain('Grammatical Range & Accuracy');
    // All four criteria are fully visible on a free report.
    expect(container.textContent).toContain('A clear position');
    expect(container.textContent).toContain('Logical paragraphs');
    expect(container.textContent).toContain('Avoid repetition');
    expect(container.textContent).toContain('Check agreement');

    // The first correction is real; the locked ones are shaped placeholders.
    expect(container.textContent).toContain('People are affected');
    expect(container.textContent).toContain('1 of 3 shown');
    expect(container.textContent).toContain('Band 8 rewrite of your weakest paragraph');
    expect(container.textContent).toContain(
      '30 days to practise with full feedback'
    );
    expect(container.textContent).toContain('band on all four criteria and one real correction');

    // No withheld text is in the DOM, so un-blurring reveals nothing.
    expect(container.textContent).not.toContain('In society today');
    expect(container.textContent).not.toContain('They were late');
    expect(container.textContent).not.toContain('A band eight version');
    expect(container.textContent).not.toContain('A relevant response with several fixable');
    expect(container.textContent).not.toContain('Add a more specific example');

    // Masked blocks are decorative, unselectable and hidden from a11y.
    const masked = container.querySelectorAll('[aria-hidden="true"].select-none');
    expect(masked.length).toBeGreaterThan(0);

    expect(track).toHaveBeenCalledWith(
      'pro_preview_shown',
      expect.objectContaining({
        source: 'score_tease',
        skill: 'writing',
        band: 6,
        corrections_shown: 1,
        corrections_locked: 2,
        rewrite_locked: true,
      })
    );
    expect(track).toHaveBeenCalledWith(
      'premium_gate',
      expect.objectContaining({ source: 'score_tease', stage: 'impression', band: 6 })
    );

    const upgrade = container.querySelector('a[href^="/pricing?upgrade=writing"]');
    expect(container.querySelectorAll('a[href^="/pricing?upgrade=writing"]')).toHaveLength(1);
    expect(container.textContent).toContain('on your next essays');
    upgrade.addEventListener('click', (event) => event.preventDefault());
    act(() => {
      upgrade.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(track).toHaveBeenCalledWith(
      'paywall_upgrade_click',
      expect.objectContaining({ source: 'score_tease', skill: 'writing', band: 6 })
    );
  });

  it('locks criteria a source withheld (the estimator free reveal)', () => {
    render(
      <WritingScoreReport
        task={2}
        result={{
          overallBand: 6,
          free: true,
          criteria: { taskResponse: result.criteria.taskResponse },
          lockedIssueCount: 9,
        }}
      />
    );
    expect(container.textContent).toContain('A clear position');
    expect(container.textContent).not.toContain('Logical paragraphs');
    expect(container.textContent).toContain('Premium');
    // Upgrade copy must not claim four visible bands when only one was sent.
    expect(container.textContent).toContain('overall band and your first criterion');
    expect(container.textContent).not.toContain('all four criteria');
  });

  it('renders the complete report without a preview for a paid score', () => {
    render(<WritingScoreReport task={2} result={{ ...result, free: false }} />);
    expect(container.textContent).toContain('Logical paragraphs');
    expect(container.textContent).toContain('Avoid repetition');
    expect(container.textContent).toContain('A relevant response with several fixable');
    expect(container.textContent).toContain('People are affected');
    expect(container.textContent).toContain('They were late');
    expect(container.textContent).toContain('A band eight version');
    expect(container.textContent).toContain('Second body paragraph');
    expect(container.textContent).not.toContain('See the 30-day Exam Pass');
    expect(track).not.toHaveBeenCalled();
  });
});
