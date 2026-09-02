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
    endpoint: 'https://push.example.com/abc',
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
function makeAdmin({ attempts = [] } = {}) {
  const writes = { push_subscriptions: [], activity_events: [] };
  return {
    writes,
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
    expect(admin.writes.push_subscriptions[0].fields).toMatchObject({ failures: 0 });
    expect(admin.writes.push_subscriptions[0].fields.last_sent_at).toBe(NOW.toISOString());
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
    expect(admin.writes.push_subscriptions[0].fields).toMatchObject({
      enabled: false,
      disabled_reason: 'push-gone',
      failures: 1,
    });
    expect(admin.writes.activity_events).toHaveLength(0);
  });

  it('keeps a transient failure enabled until the fifth consecutive one', async () => {
    const admin = makeAdmin();
    const send = vi.fn().mockResolvedValue({ sent: false, gone: false, statusCode: 500 });

    await sendDueReminders(admin, {
      now: NOW,
      send,
      subscriptions: [subscription({ failures: 1 }), subscription({ id: 'sub-2', failures: 4 })],
    });

    expect(admin.writes.push_subscriptions[0].fields).toMatchObject({
      failures: 2,
      enabled: true,
    });
    expect(admin.writes.push_subscriptions[1].fields).toMatchObject({
      failures: 5,
      enabled: false,
      disabled_reason: 'too-many-failures',
    });
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
      { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } },
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
    const result = await sendPush({ endpoint: 'https://push.example.com/abc' }, {}, { webPush: {} });
    if (publicKey === undefined) delete process.env.WEB_PUSH_PUBLIC_KEY;
    else process.env.WEB_PUSH_PUBLIC_KEY = publicKey;

    expect(result).toMatchObject({ sent: false, reason: 'web-push-not-configured' });
  });

  it('serialises the payload and sets a TTL on a successful send', async () => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'test-public';
    process.env.WEB_PUSH_PRIVATE_KEY = 'test-private';
    const webPush = { setVapidDetails: vi.fn(), sendNotification: vi.fn().mockResolvedValue({}) };

    const result = await sendPush(
      { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } },
      { title: 'Your daily IELTS question is ready', url: '/review?src=push' },
      { webPush }
    );

    expect(result.sent).toBe(true);
    const [target, payload, options] = webPush.sendNotification.mock.calls[0];
    expect(target.endpoint).toBe('https://push.example.com/abc');
    expect(JSON.parse(payload).url).toBe('/review?src=push');
    expect(options.TTL).toBeGreaterThan(0);
  });
});
