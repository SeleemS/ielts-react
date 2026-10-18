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
import { reduceForFree } from '../../../lib/writingReport';
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

// Exactly what the API sends a free user (reduceForFree in
// lib/writingReport.js): the first criterion, ONE real correction, and counts —
// never the withheld strings.
const freeResult = { ...reduceForFree(result), wordCount: result.wordCount, free: true };

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
  it('shows the overall band, the first criterion and ONE real correction, and masks the rest', () => {
    expect(Object.keys(freeResult.criteria)).toEqual(['taskResponse']);
    expect(freeResult.lockedCriteriaCount).toBe(3);
    render(<WritingScoreReport task={2} result={freeResult} />);

    const headings = [...container.querySelectorAll('h3')].map((node) => node.textContent);
    expect(headings).toContain('Task Response');
    // Only the first criterion's real feedback is on a free report; the other
    // three are named but locked, with no band or text in the DOM.
    expect(container.textContent).toContain('A clear position');
    expect(container.textContent).toContain('Coherence & Cohesion');
    expect(container.textContent).not.toContain('Logical paragraphs');
    expect(container.textContent).not.toContain('Avoid repetition');
    expect(container.textContent).not.toContain('Check agreement');

    // The first correction is real; the locked ones are shaped placeholders.
    expect(container.textContent).toContain('People are affected');
    expect(container.textContent).toContain('1 of 3 shown');
    expect(container.textContent).toContain('Band 8 rewrite of your weakest paragraph');
    expect(container.textContent).toContain('Get the full report on your next essay');
    // The offer names the value THIS essay had withheld, not a generic perk.
    expect(container.textContent).toContain('this essay had 2 more we held back');
    expect(container.textContent).toContain('one was written for this essay');
    expect(container.textContent).toContain('overall band and your first criterion');
    expect(container.textContent).toContain('Band and feedback on all four criteria');

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

    expect(container.querySelectorAll('a[href^="/pricing?upgrade=writing"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="quick-checkout"]')).not.toBeNull();
    expect(container.textContent).toContain('this free sample stays as it is');
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
    expect(container.textContent).toContain('Pro');
    // Upgrade copy must not claim four visible bands when only one was sent.
    expect(container.textContent).toContain('overall band and your first criterion');
    expect(container.textContent).not.toContain('seen your band on all four criteria');
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
    expect(container.querySelector('[data-testid="quick-checkout"]')).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
  it('renders the afterOffer slot below the Pro offer on free reports only', () => {
    const slot = <aside data-testid="after-offer">tutor card</aside>;
    render(<WritingScoreReport task={2} result={freeResult} afterOffer={slot} />);
    const html = container.innerHTML;
    expect(html).toContain('data-testid="after-offer"');
    expect(html.indexOf('data-testid="quick-checkout"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="after-offer"')).toBeGreaterThan(html.indexOf('data-testid="quick-checkout"'));

    render(<WritingScoreReport task={2} result={{ ...result, free: false }} afterOffer={slot} />);
    expect(container.innerHTML).not.toContain('after-offer');

    render(<WritingScoreReport task={2} result={freeResult} sample afterOffer={slot} />);
    expect(container.innerHTML).not.toContain('after-offer');
  });
});
