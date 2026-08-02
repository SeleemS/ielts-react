// /review queue construction: latest attempt per passage wins, only wrong or
// skipped questions queue, cleared passages drop out.
import { describe, expect, it } from 'vitest';
import { buildQueue } from '../src/lib/reviewQueue';

const attempt = (overrides) => ({
  id: 'a1',
  skill: 'reading',
  created_at: '2026-08-01T10:00:00.000Z',
  submitted_at: '2026-08-01T10:20:00.000Z',
  passages: { slug: 'passage-a', title: 'Passage A', skill: 'reading' },
  per_question: {},
  ...overrides,
});

describe('buildQueue', () => {
  it('queues wrong and skipped questions from the latest attempt only', () => {
    const queue = buildQueue([
      // Newest first, as the query returns them.
      attempt({
        id: 'new',
        per_question: {
          1: { correct: true, questionType: 'tfng' },
          2: { correct: false, questionType: 'tfng' },
          3: { correct: false, answered: false, questionType: 'multiple_choice' },
        },
      }),
      attempt({
        id: 'old',
        created_at: '2026-07-01T10:00:00.000Z',
        per_question: { 1: { correct: false }, 2: { correct: false }, 4: { correct: false } },
      }),
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0].slug).toBe('passage-a');
    expect(queue[0].missed).toEqual([2, 3]);
    expect(queue[0].types.sort()).toEqual(['multiple_choice', 'tfng']);
  });

  it('drops passages whose latest attempt is fully correct', () => {
    const queue = buildQueue([
      attempt({ id: 'new', per_question: { 1: { correct: true }, 2: { correct: true } } }),
      attempt({
        id: 'old',
        created_at: '2026-07-01T10:00:00.000Z',
        per_question: { 1: { correct: false } },
      }),
    ]);
    expect(queue).toHaveLength(0);
  });

  it('sorts passages by mistake count, most first', () => {
    const queue = buildQueue([
      attempt({
        id: 'a',
        passages: { slug: 'one-wrong', title: 'One', skill: 'reading' },
        per_question: { 1: { correct: false } },
      }),
      attempt({
        id: 'b',
        passages: { slug: 'three-wrong', title: 'Three', skill: 'listening' },
        per_question: { 1: { correct: false }, 2: { correct: false }, 3: { correct: false } },
      }),
    ]);
    expect(queue.map((entry) => entry.slug)).toEqual(['three-wrong', 'one-wrong']);
  });

  it('ignores attempts without a passage (mock attempts) and empty input', () => {
    expect(buildQueue([attempt({ passages: null, per_question: { 1: { correct: false } } })])).toEqual([]);
    expect(buildQueue([])).toEqual([]);
    expect(buildQueue(null)).toEqual([]);
  });
});
