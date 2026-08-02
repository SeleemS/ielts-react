// Personalized lifecycle suite (2026-08-02): template rendering for the six
// new email types + queue targeting for the exam countdown.
import { describe, expect, it } from 'vitest';
import { renderLifecycleEmail } from '../lib/lifecycleEmail';
import { queueExamCountdown } from '../pages/api/cron/lifecycle-emails';

const NOW = new Date('2026-08-02T10:00:00.000Z');

function render(email_type, payload = {}) {
  return renderLifecycleEmail({
    email_type,
    payload,
    recipient_email: 'student@example.com',
  });
}

describe('new lifecycle templates', () => {
  it('exam_countdown renders the day count and a practice CTA, no sales pitch', () => {
    const far = render('exam_countdown', { days_left: 30, target_band: 7 });
    expect(far.subject).toBe('30 days to your IELTS test');
    expect(far.html).toContain('Band 7');
    expect(far.html).toContain('/mock-test');
    expect(far.html).not.toContain('/pricing');

    const near = render('exam_countdown', { days_left: 2 });
    expect(near.subject).toContain('final checklist');
    expect(near.html).toContain('/dashboard');
  });

  it('checkout_abandoned restates the guarantee and restores upgrade context', () => {
    const rendered = render('checkout_abandoned', { upgrade: 'writing' });
    expect(rendered.subject).toContain('no charge was made');
    expect(rendered.html).toContain('14-day money-back guarantee');
    expect(rendered.html).toContain('/pricing?upgrade=writing');
    expect(rendered.html).toContain('Your essay is saved');
  });

  it('checkout_abandoned ignores an unexpected upgrade value', () => {
    const rendered = render('checkout_abandoned', { upgrade: '"><script>' });
    expect(rendered.html).toContain('href="https://www.ielts-bank.com/pricing"');
    expect(rendered.html).not.toContain('<script>');
  });

  it('paywall_followup targets the skill that hit the gate', () => {
    expect(render('paywall_followup', { skill: 'speaking' }).html).toContain(
      '/pricing?upgrade=speaking'
    );
    expect(render('paywall_followup', {}).html).toContain('/pricing?upgrade=writing');
  });

  it('weekly_progress renders real numbers and a zero-activity variant', () => {
    const active = render('weekly_progress', {
      sessions: 4,
      skills_line: '3 reading, 1 listening',
      streak: 5,
    });
    expect(active.subject).toBe('Your week: 4 sessions, 5-day streak');
    expect(active.html).toContain('3 reading, 1 listening');

    const idle = render('weekly_progress', { sessions: 0 });
    expect(idle.subject).toContain('Restart');
  });

  it('streak_at_risk names the streak length', () => {
    const rendered = render('streak_at_risk', { streak: 6 });
    expect(rendered.subject).toBe('Your 6-day streak ends tonight');
    expect(rendered.html).toContain('6 days of practice');
  });

  it('day2_first_week_plan links the suggested next skill', () => {
    const rendered = render('day2_first_week_plan', {
      practiced_skill: 'reading',
      next_skill: 'listening',
    });
    expect(rendered.html).toContain('/listeningquestion');
    expect(rendered.html).toContain('reading');
  });

  it('every new type carries an unsubscribe/footer block', () => {
    for (const type of [
      'exam_countdown',
      'checkout_abandoned',
      'paywall_followup',
      'weekly_progress',
      'streak_at_risk',
      'day2_first_week_plan',
    ]) {
      const rendered = render(type, { days_left: 7, streak: 3, sessions: 1 });
      expect(rendered.html).toContain('You received this because');
    }
  });
});

describe('queueExamCountdown', () => {
  function fakeAdmin({ users, batches }) {
    return {
      from(table) {
        if (table === 'users') {
          const query = {
            select: () => query,
            in: () => query,
            not: () => Promise.resolve({ data: users, error: null }),
          };
          return query;
        }
        if (table === 'lifecycle_emails') {
          return {
            upsert(rows, options) {
              batches.push({ rows, options });
              return {
                select: async () => ({
                  data: rows.map((_, index) => ({ id: `row-${index}` })),
                  error: null,
                }),
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
  }

  it('queues one idempotent row per user with the matching day count', async () => {
    const batches = [];
    const admin = fakeAdmin({
      batches,
      users: [
        { id: 'u1', email: 'A@Example.com', exam_date: '2026-08-09', target_band: 7.5 },
        { id: 'u2', email: 'b@example.com', exam_date: '2026-09-01', target_band: null },
      ],
    });
    const queued = await queueExamCountdown(admin, NOW);
    expect(queued).toBe(2);
    const rows = batches.flatMap((batch) => batch.rows);
    const u1 = rows.find((row) => row.user_id === 'u1');
    expect(u1.payload.days_left).toBe(7);
    expect(u1.recipient_email).toBe('a@example.com');
    expect(u1.idempotency_key).toBe('exam_countdown:u1:7:2026-08-09');
    const u2 = rows.find((row) => row.user_id === 'u2');
    expect(u2.payload.days_left).toBe(30);
    expect(batches[0].options).toEqual({ onConflict: 'idempotency_key', ignoreDuplicates: true });
  });

  it('queues nothing when no exam dates match a countdown day', async () => {
    const batches = [];
    const admin = fakeAdmin({ batches, users: [] });
    expect(await queueExamCountdown(admin, NOW)).toBe(0);
    expect(batches).toHaveLength(0);
  });
});
