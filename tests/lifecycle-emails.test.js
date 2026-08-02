import { describe, expect, it, vi } from 'vitest';
import {
  config,
  deliverDue,
  queueWeeklyDigest,
  queueWinBack,
  recipientAllowsMarketing,
  reclaimStaleDeliveries,
} from '../pages/api/cron/lifecycle-emails';
import { unsubscribeToken } from '../lib/lifecycleEmail';

const NOW = new Date('2026-07-19T12:00:00.000Z');

function resultQuery(result) {
  const query = {
    eq: () => query,
    gt: () => query,
    gte: () => query,
    in: () => query,
    is: () => query,
    lt: () => query,
    lte: () => query,
    not: () => query,
    order: () => query,
    limit: () => Promise.resolve(result),
    select: () => query,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function pagedSource(pages, calls) {
  return {
    select(columns) {
      const call = { columns, filters: [], order: null, limit: null };
      const query = {
        eq: (...args) => {
          call.filters.push(['eq', ...args]);
          return query;
        },
        gt: (...args) => {
          call.filters.push(['gt', ...args]);
          return query;
        },
        is: (...args) => {
          call.filters.push(['is', ...args]);
          return query;
        },
        lte: (...args) => {
          call.filters.push(['lte', ...args]);
          return query;
        },
        not: (...args) => {
          call.filters.push(['not', ...args]);
          return query;
        },
        order: (...args) => {
          call.order = args;
          return query;
        },
        limit: async (limit) => {
          call.limit = limit;
          calls.push(call);
          return pages.shift() || { data: [], error: null };
        },
      };
      return query;
    },
  };
}

function lifecycleSink(batches) {
  return {
    upsert(rows, options) {
      const select = vi.fn().mockResolvedValue({
        data: rows.map((_, index) => ({ id: `inserted-${batches.length}-${index}` })),
        error: null,
      });
      batches.push({ rows, options, select });
      return { select };
    },
  };
}

describe('lifecycle email delivery safety', () => {
  it('allows the cron enough runtime to finish paginated audiences', () => {
    expect(config).toEqual({ runtime: 'nodejs', maxDuration: 300 });
  });

  it('reports only weekly digests actually inserted after idempotency conflicts', async () => {
    const upsert = vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
    const admin = {
      from(table) {
        if (table === 'newsletter_subscribers') {
          return {
            select: () =>
              resultQuery({
                data: [
                  { email: 'First@Example.com' },
                  { email: 'second@example.com' },
                ],
                error: null,
              }),
          };
        }
        if (table === 'users') {
          return {
            select: () =>
              resultQuery({
                data: [
                  {
                    id: 'user-1',
                    email: 'first@example.com',
                    plan: 'free',
                    plan_status: 'inactive',
                  },
                ],
                error: null,
              }),
          };
        }
        if (table === 'attempts') {
          // No recent practice: every subscriber stays on the generic digest.
          return { select: () => resultQuery({ data: [], error: null }) };
        }
        expect(table).toBe('lifecycle_emails');
        return { upsert };
      },
    };

    await expect(queueWeeklyDigest(admin, true, NOW)).resolves.toBe(0);
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: 'user-1',
          recipient_email: 'first@example.com',
          idempotency_key: 'weekly_digest:2026-07-13:first@example.com',
        }),
        expect.objectContaining({
          user_id: null,
          recipient_email: 'second@example.com',
          idempotency_key: 'weekly_digest:2026-07-13:second@example.com',
        }),
      ],
      { onConflict: 'idempotency_key', ignoreDuplicates: true }
    );
    expect(upsert.mock.results[0].value.select).toHaveBeenCalledWith('id');
  });

  it('reports only win-back rows actually inserted after idempotency conflicts', async () => {
    const previousCoupon = process.env.STRIPE_WINBACK_COUPON_ID;
    process.env.STRIPE_WINBACK_COUPON_ID = 'coupon-test';
    const upsert = vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'inserted-1' }], error: null }),
    }));
    const admin = {
      from(table) {
        if (table === 'users') {
          return {
            select: () =>
              resultQuery({
                data: [
                  {
                    id: 'user-1',
                    email: 'First@Example.com',
                    canceled_at: '2026-06-01T00:00:00.000Z',
                  },
                  {
                    id: 'user-2',
                    email: 'second@example.com',
                    canceled_at: '2026-06-02T00:00:00.000Z',
                  },
                ],
                error: null,
              }),
          };
        }
        expect(table).toBe('lifecycle_emails');
        return { upsert };
      },
    };

    try {
      await expect(queueWinBack(admin, NOW)).resolves.toBe(1);
    } finally {
      if (previousCoupon === undefined) delete process.env.STRIPE_WINBACK_COUPON_ID;
      else process.env.STRIPE_WINBACK_COUPON_ID = previousCoupon;
    }
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: 'user-1',
          recipient_email: 'first@example.com',
          idempotency_key: 'win_back:user-1:2026-06-01',
        }),
        expect.objectContaining({
          user_id: 'user-2',
          recipient_email: 'second@example.com',
          idempotency_key: 'win_back:user-2:2026-06-02',
        }),
      ],
      { onConflict: 'idempotency_key', ignoreDuplicates: true }
    );
    expect(upsert.mock.results[0].value.select).toHaveBeenCalledWith('id');
  });

  it('paginates the complete weekly audience and writes bounded queue batches', async () => {
    const subscribers = Array.from({ length: 1001 }, (_, index) => ({
      email: `learner-${String(index).padStart(4, '0')}@example.com`,
    }));
    const users = subscribers.map(({ email }, index) => ({
      id: `user-${String(index).padStart(4, '0')}`,
      email,
      plan: 'free',
      plan_status: 'inactive',
    }));
    const subscriberCalls = [];
    const userCalls = [];
    const batches = [];
    const sources = {
      newsletter_subscribers: pagedSource(
        [
          { data: subscribers.slice(0, 1000), error: null },
          { data: subscribers.slice(1000), error: null },
        ],
        subscriberCalls
      ),
      users: pagedSource(
        [
          { data: users.slice(0, 1000), error: null },
          { data: users.slice(1000), error: null },
        ],
        userCalls
      ),
      // No recent practice: everyone stays on the generic digest.
      attempts: { select: () => resultQuery({ data: [], error: null }) },
      lifecycle_emails: lifecycleSink(batches),
    };
    const admin = { from: (table) => sources[table] };

    await expect(queueWeeklyDigest(admin, true, NOW)).resolves.toBe(1001);
    expect(subscriberCalls).toHaveLength(2);
    expect(subscriberCalls[0]).toMatchObject({
      order: ['email', { ascending: true }],
      limit: 1000,
    });
    expect(subscriberCalls[1].filters).toContainEqual([
      'gt',
      'email',
      'learner-0999@example.com',
    ]);
    expect(userCalls).toHaveLength(2);
    expect(userCalls[1].filters).toContainEqual(['gt', 'id', 'user-0999']);
    expect(batches.map(({ rows }) => rows.length)).toEqual([1000, 1]);
    expect(batches.every(({ select }) => select.mock.calls[0][0] === 'id')).toBe(true);
  });

  it('paginates every eligible win-back user and writes bounded queue batches', async () => {
    const previousCoupon = process.env.STRIPE_WINBACK_COUPON_ID;
    process.env.STRIPE_WINBACK_COUPON_ID = 'coupon-test';
    const users = Array.from({ length: 1001 }, (_, index) => ({
      id: `user-${String(index).padStart(4, '0')}`,
      email: `learner-${String(index).padStart(4, '0')}@example.com`,
      canceled_at: '2026-06-01T00:00:00.000Z',
    }));
    const userCalls = [];
    const batches = [];
    const sources = {
      users: pagedSource(
        [
          { data: users.slice(0, 1000), error: null },
          { data: users.slice(1000), error: null },
        ],
        userCalls
      ),
      lifecycle_emails: lifecycleSink(batches),
    };
    const admin = { from: (table) => sources[table] };

    try {
      await expect(queueWinBack(admin, NOW)).resolves.toBe(1001);
    } finally {
      if (previousCoupon === undefined) delete process.env.STRIPE_WINBACK_COUPON_ID;
      else process.env.STRIPE_WINBACK_COUPON_ID = previousCoupon;
    }
    expect(userCalls).toHaveLength(2);
    expect(userCalls[0]).toMatchObject({
      order: ['id', { ascending: true }],
      limit: 1000,
    });
    expect(userCalls[1].filters).toContainEqual(['gt', 'id', 'user-0999']);
    expect(batches.map(({ rows }) => rows.length)).toEqual([1000, 1]);
  });

  it('fails before queue writes when a later audience page is unavailable', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      email: `learner-${String(index).padStart(4, '0')}@example.com`,
    }));
    const calls = [];
    const source = pagedSource(
      [
        { data: firstPage, error: null },
        { data: null, error: { message: 'audience page unavailable' } },
      ],
      calls
    );
    const admin = {
      from(table) {
        expect(table).toBe('newsletter_subscribers');
        return source;
      },
    };

    await expect(queueWeeklyDigest(admin, true, NOW)).rejects.toMatchObject({
      message: 'audience page unavailable',
    });
    expect(calls).toHaveLength(2);
  });

  it('uses the dedicated unsubscribe secret when configured', () => {
    const previous = process.env.EMAIL_UNSUBSCRIBE_SECRET;
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'dedicated-test-secret';
    const token = unsubscribeToken('learner@example.com');
    if (previous === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    else process.env.EMAIL_UNSUBSCRIBE_SECRET = previous;

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(token).not.toBe('');
  });

  it('only treats a confirmed, currently subscribed recipient as marketing-eligible', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce({ select: () => resultQuery({ data: { email: 'learner@example.com' }, error: null }) })
      .mockReturnValueOnce({ select: () => resultQuery({ data: null, error: null }) });
    const admin = { from };

    await expect(recipientAllowsMarketing(admin, ' Learner@Example.com ')).resolves.toBe(true);
    await expect(recipientAllowsMarketing(admin, 'opted-out@example.com')).resolves.toBe(false);
  });

  it('returns every stale sending claim to failed, including terminal attempts', async () => {
    const filters = [];
    const query = {
      eq: (...args) => {
        filters.push(['eq', ...args]);
        return query;
      },
      is: (...args) => {
        filters.push(['is', ...args]);
        return query;
      },
      lt: (...args) => {
        filters.push(['lt', ...args]);
        return query;
      },
      select: () =>
        Promise.resolve({
          data: [{ id: 'email-1' }, { id: 'email-terminal' }],
          error: null,
        }),
    };
    const update = vi.fn(() => query);
    const admin = { from: vi.fn(() => ({ update })) };

    await expect(reclaimStaleDeliveries(admin, NOW)).resolves.toBe(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        last_error: 'delivery-claim-expired',
        updated_at: NOW.toISOString(),
      })
    );
    expect(filters).toEqual([
      ['eq', 'status', 'sending'],
      ['is', 'sent_at', null],
      ['lt', 'updated_at', '2026-07-19T11:45:00.000Z'],
    ]);
  });

  it('suppresses queued marketing after an unsubscribe without calling the provider', async () => {
    const row = {
      id: 'email-2',
      email_type: 'weekly_digest',
      recipient_email: 'opted-out@example.com',
      attempts: 0,
    };
    const lifecycleUpdates = [];
    let lifecycleSelects = 0;
    const admin = {
      from(table) {
        if (table === 'newsletter_subscribers') {
          return { select: () => resultQuery({ data: null, error: null }) };
        }
        return {
          update(fields) {
            lifecycleUpdates.push(fields);
            if (fields.last_error === 'delivery-claim-expired') {
              return resultQuery({ data: [], error: null });
            }
            return resultQuery({ data: { id: row.id }, error: null });
          },
          select() {
            lifecycleSelects += 1;
            return resultQuery({ data: lifecycleSelects === 1 ? [row] : [], error: null });
          },
        };
      },
    };
    const send = vi.fn();

    await expect(deliverDue(admin, { send, now: NOW })).resolves.toMatchObject({
      sent: 0,
      suppressed: 1,
      reclaimed: 0,
    });
    expect(send).not.toHaveBeenCalled();
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'suppressed', last_error: 'recipient-not-subscribed' })
    );
  });

  it('claims and records a consented marketing send exactly once', async () => {
    const row = {
      id: 'email-3',
      email_type: 'win_back',
      recipient_email: 'subscriber@example.com',
      attempts: 1,
      idempotency_key: 'win_back:user-1:2026-06-01',
    };
    const lifecycleUpdates = [];
    let lifecycleSelects = 0;
    const admin = {
      from(table) {
        if (table === 'newsletter_subscribers') {
          return {
            select: () =>
              resultQuery({ data: { email: 'subscriber@example.com' }, error: null }),
          };
        }
        return {
          update(fields) {
            lifecycleUpdates.push(fields);
            if (fields.last_error === 'delivery-claim-expired') {
              return resultQuery({ data: [], error: null });
            }
            if (fields.status === 'sending') {
              return resultQuery({ data: { id: row.id }, error: null });
            }
            return resultQuery({ data: null, error: null });
          },
          select() {
            lifecycleSelects += 1;
            return resultQuery({ data: lifecycleSelects === 1 ? [row] : [], error: null });
          },
        };
      },
    };
    const send = vi.fn().mockResolvedValue({ sent: true, providerId: 'resend-1' });

    await expect(deliverDue(admin, { send, now: NOW })).resolves.toMatchObject({
      sent: 1,
      suppressed: 0,
      reclaimed: 0,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'sending', attempts: 2 })
    );
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'sent', provider_id: 'resend-1' })
    );
  });

  it('records a rejected delivery immediately and continues the remaining batch', async () => {
    const rows = [
      {
        id: 'email-4',
        email_type: 'welcome_signup',
        recipient_email: 'first@example.com',
        attempts: 4,
        idempotency_key: 'welcome_signup:user-4',
      },
      {
        id: 'email-5',
        email_type: 'welcome_signup',
        recipient_email: 'second@example.com',
        attempts: 0,
        idempotency_key: 'welcome_signup:user-5',
      },
    ];
    const lifecycleUpdates = [];
    let dueReads = 0;
    const admin = {
      from(table) {
        expect(table).toBe('lifecycle_emails');
        return {
          update(fields) {
            lifecycleUpdates.push(fields);
            if (fields.last_error === 'delivery-claim-expired') {
              return resultQuery({ data: [], error: null });
            }
            if (fields.status === 'sending') {
              return resultQuery({ data: { id: 'claimed' }, error: null });
            }
            return resultQuery({ data: null, error: null });
          },
          select() {
            dueReads += 1;
            return resultQuery({
              data: dueReads === 1 ? rows : [],
              error: null,
            });
          },
        };
      },
    };
    const send = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('provider\nnetwork\u0000 unavailable')
      )
      .mockResolvedValueOnce({ sent: true, providerId: 'resend-2' });

    await expect(deliverDue(admin, { send, now: NOW })).resolves.toMatchObject({
      sent: 1,
      failed: 1,
      skipped: 0,
      reclaimed: 0,
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'sending', attempts: 5 })
    );
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        last_error: 'delivery-error: provider network unavailable',
      })
    );
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'sending', attempts: 1 })
    );
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'sent', provider_id: 'resend-2' })
    );
  });
});
