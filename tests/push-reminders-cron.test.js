// Hourly push reminder run: one send per due subscription, push_sent
// telemetry, and cleanup when the push service says the endpoint is gone.
import { describe, expect, it, vi } from 'vitest';
import { sendDueReminders } from '../pages/api/cron/push-reminders';
import { sendPush } from '../lib/webPush';

const NOW = new Date('2026-09-02T14:00:00Z'); // 19:00 in Asia/Karachi

function subscription(overrides = {}) {
  return {
    id: 'sub-1',
    user_id: 'user-1',
    endpoint: 'https://fcm.googleapis.com/wp/abc',
    keys: { p256dh: 'p', auth: 'a' },
    time_zone: 'Asia/Karachi',
    tz_offset_minutes: 300,
    reminder_hour_local: 19,
    enabled: true,
    failures: 0,
    last_sent_at: null,
    ...overrides,
  };
}

// Minimal admin double: attempts feed the streak/review context, and every
// write is recorded for assertions.
function makeAdmin({ attempts = [], rows = [subscription()] } = {}) {
  const writes = { push_subscriptions: [], activity_events: [] };
  return {
    writes,
    rpc: vi.fn(async (name, args) => {
      if (name === 'claim_push_reminder') {
        const row = rows.find((item) => item.id === args.p_subscription_id);
        return { data: { claimed: !!row, token: 'claim-token', subscription: row }, error: null };
      }
      return { data: true, error: null };
    }),
    from(table) {
      if (table === 'attempts') {
        const query = {
          select: () => query,
          in: () => query,
          gte: () => query,
          order: () => query,
          limit: async () => ({ data: attempts, error: null }),
        };
        return query;
      }
      if (table === 'activity_events') {
        return {
          insert: async (row) => {
            writes.activity_events.push(row);
            return { error: null };
          },
        };
      }
      return {
        update: (fields) => ({
          eq: async (field, value) => {
            writes.push_subscriptions.push({ fields, field, value });
            return { error: null };
          },
        }),
      };
    },
  };
}

const attemptRow = (day, correct = false) => ({
  user_id: 'user-1',
  skill: 'reading',
  created_at: `${day}T09:00:00.000Z`,
  submitted_at: `${day}T09:20:00.000Z`,
  per_question: { 1: { correct }, 2: { correct: true } },
  passages: { slug: `passage-${day}`, title: 'Practice passage', skill: 'reading' },
});

describe('sendDueReminders', () => {
  it('sends one streak-aware notification and records push_sent', async () => {
    const admin = makeAdmin({
      attempts: [attemptRow('2026-09-02'), attemptRow('2026-09-01'), attemptRow('2026-08-31')],
    });
    const send = vi.fn().mockResolvedValue({ sent: true });

    const results = await sendDueReminders(admin, {
      now: NOW,
      send,
      subscriptions: [subscription(), subscription({ id: 'sub-2', reminder_hour_local: 8 })],
    });

    expect(results).toMatchObject({ candidates: 2, due: 1, sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const [, payload] = send.mock.calls[0];
    expect(payload.title).toContain('3-day streak');
    expect(payload.url).toBe('/review?src=push');
    expect(payload.notification_id).toBe('sub-1:2026-09-02');

    const event = admin.writes.activity_events[0];
    expect(event).toMatchObject({ event: 'push_sent', user_id: 'user-1', anon_id: 'push:user-1' });
    expect(event.props).toMatchObject({ source: 'push_reminder', streak: 3 });
    expect(admin.rpc).toHaveBeenCalledWith('finish_push_reminder', expect.objectContaining({ p_sent: true, p_token: 'claim-token' }));
  });

  it('links to the skill index when nothing is left to review', async () => {
    const admin = makeAdmin({ attempts: [attemptRow('2026-09-02', true)] });
    const send = vi.fn().mockResolvedValue({ sent: true });

    await sendDueReminders(admin, { now: NOW, send, subscriptions: [subscription()] });

    expect(send.mock.calls[0][1].url).toBe('/readingquestion?src=push');
  });

  it('disables a subscription the push service reports as gone (410)', async () => {
    const admin = makeAdmin();
    const send = vi.fn().mockResolvedValue({ sent: false, gone: true, statusCode: 410 });

    const results = await sendDueReminders(admin, {
      now: NOW,
      send,
      subscriptions: [subscription()],
    });

    expect(results).toMatchObject({ sent: 0, failed: 1, disabled: 1 });
    expect(admin.rpc).toHaveBeenCalledWith('finish_push_reminder', expect.objectContaining({ p_sent: false, p_gone: true }));
    expect(admin.writes.activity_events).toHaveLength(0);
  });

  it('records transient failures and counts retirement at the fifth failure', async () => {
    const rows = [subscription({ failures: 1 }), subscription({ id: 'sub-2', failures: 4 })];
    const admin = makeAdmin({ rows });
    const send = vi.fn().mockResolvedValue({ sent: false, gone: false, statusCode: 500 });

    const result = await sendDueReminders(admin, { now: NOW, send, subscriptions: rows });

    expect(result).toMatchObject({ failed: 2, disabled: 1 });
    expect(admin.rpc).toHaveBeenCalledWith('finish_push_reminder', expect.objectContaining({ p_sent: false, p_gone: false }));
  });

  it('does not dispatch from a losing concurrent claim or an already sent row', async () => {
    const admin = makeAdmin();
    let claimed = false;
    admin.rpc.mockImplementation(async (name) => {
      if (name === 'finish_push_reminder') return { data: true, error: null };
      if (claimed) return { data: { claimed: false }, error: null };
      claimed = true;
      return { data: { claimed: true, token: 'winner', subscription: subscription() }, error: null };
    });
    let settle;
    const send = vi.fn(() => new Promise((resolve) => { settle = resolve; }));
    const first = sendDueReminders(admin, { now: NOW, send, subscriptions: [subscription()] });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(await sendDueReminders(admin, { now: NOW, send, subscriptions: [subscription()] })).toMatchObject({ sent: 0, failed: 0 });
    settle({ sent: true });
    await first;
    await sendDueReminders(admin, { now: NOW, send, subscriptions: [subscription()] });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('fails closed on claim failure and does not report stale-token completion as success', async () => {
    const admin = makeAdmin();
    const send = vi.fn().mockResolvedValue({ sent: true });
    admin.rpc.mockResolvedValueOnce({ error: new Error('database unavailable') });
    await expect(sendDueReminders(admin, { now: NOW, send, subscriptions: [subscription()] })).rejects.toThrow('database unavailable');
    expect(send).not.toHaveBeenCalled();
    admin.rpc.mockResolvedValueOnce({ data: { claimed: true, token: 'old', subscription: subscription() } });
    admin.rpc.mockResolvedValueOnce({ data: false });
    await expect(sendDueReminders(admin, { now: NOW, send, subscriptions: [subscription()] })).rejects.toThrow('no longer owned');
    expect(admin.writes.activity_events).toHaveLength(0);
  });

  it('retires a preexisting untrusted row without calling the provider', async () => {
    const row = subscription({ endpoint: 'https://attacker.example/collect' });
    const admin = makeAdmin({ rows: [row] });
    const webPush = { setVapidDetails: vi.fn(), sendNotification: vi.fn() };
    const result = await sendDueReminders(admin, { now: NOW, subscriptions: [row],
      send: (sub, payload) => sendPush(sub, payload, { webPush }) });
    expect(result).toMatchObject({ sent: 0, failed: 1, disabled: 1 });
    expect(webPush.sendNotification).not.toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledWith('finish_push_reminder', expect.objectContaining({ p_invalid_endpoint: true, p_gone: true }));
  });

  it('does nothing when no subscription matches the current hour', async () => {
    const admin = makeAdmin();
    const send = vi.fn();

    const results = await sendDueReminders(admin, {
      now: new Date('2026-09-02T03:00:00Z'),
      send,
      subscriptions: [subscription()],
    });

    expect(results).toMatchObject({ due: 0, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('sendPush', () => {
  it('classifies a 410 from the push service as gone', async () => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'test-public';
    process.env.WEB_PUSH_PRIVATE_KEY = 'test-private';
    const webPush = {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn().mockRejectedValue(
        Object.assign(new Error('Gone'), { statusCode: 410 })
      ),
    };

    const result = await sendPush(
      { endpoint: 'https://fcm.googleapis.com/wp/abc', keys: { p256dh: 'p', auth: 'a' } },
      { title: 'hi' },
      { webPush }
    );

    expect(result).toMatchObject({ sent: false, gone: true, statusCode: 410 });
    expect(webPush.setVapidDetails).toHaveBeenCalledWith(
      expect.stringContaining('mailto:'),
      'test-public',
      'test-private'
    );
  });

  it('reports a configuration gap instead of throwing', async () => {
    const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
    delete process.env.WEB_PUSH_PUBLIC_KEY;
    const result = await sendPush({ endpoint: 'https://fcm.googleapis.com/wp/abc' }, {}, { webPush: {} });
    if (publicKey === undefined) delete process.env.WEB_PUSH_PUBLIC_KEY;
    else process.env.WEB_PUSH_PUBLIC_KEY = publicKey;

    expect(result).toMatchObject({ sent: false, reason: 'web-push-not-configured' });
  });

  it('serialises the payload and sets a TTL on a successful send', async () => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'test-public';
    process.env.WEB_PUSH_PRIVATE_KEY = 'test-private';
    const webPush = { setVapidDetails: vi.fn(), sendNotification: vi.fn().mockResolvedValue({}) };

    const result = await sendPush(
      { endpoint: 'https://fcm.googleapis.com/wp/abc', keys: { p256dh: 'p', auth: 'a' } },
      { title: 'Your daily IELTS question is ready', url: '/review?src=push' },
      { webPush }
    );

    expect(result.sent).toBe(true);
    const [target, payload, options] = webPush.sendNotification.mock.calls[0];
    expect(target.endpoint).toBe('https://fcm.googleapis.com/wp/abc');
    expect(JSON.parse(payload).url).toBe('/review?src=push');
    expect(options.TTL).toBeGreaterThan(0);
    expect(options.timeout).toBe(15000);
  });
});
