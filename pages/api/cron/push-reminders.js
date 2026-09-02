export const config = { runtime: 'nodejs', maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { dueReminders, reminderNotification } from '../../../lib/pushSchedule';
import { sendPush } from '../../../lib/webPush';
import { buildQueue } from '../../../src/lib/reviewQueue';

// Hourly daily-reminder run (vercel.json: "7 * * * *").
//
// For every enabled subscription whose LOCAL hour equals its chosen reminder
// hour, send exactly one notification: "Your daily IELTS question is ready ·
// 🔥 {streak}-day streak", deep-linked into the mistake-review pool (or the
// reading index when that pool is empty). One per local calendar day is
// enforced in lib/pushSchedule.js via last_sent_at.
//
// Failure handling: 404/410 disables the subscription immediately (the
// endpoint is gone for good); anything else increments `failures`, and five
// consecutive failures retire the row.

const PAGE_SIZE = 1000;
const ATTEMPT_WINDOW_DAYS = 40;
const REVIEW_SELECT = 'user_id, skill, per_question, created_at, submitted_at, passages ( slug, title, skill )';

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function chunk(list, size) {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
}

export async function readEnabledSubscriptions(admin) {
  const rows = [];
  let cursor = null;
  for (;;) {
    let query = admin
      .from('push_subscriptions')
      .select(
        'id, user_id, endpoint, keys, time_zone, tz_offset_minutes, reminder_hour_local, enabled, failures, last_sent_at'
      )
      .eq('enabled', true)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    const next = page[page.length - 1]?.id;
    if (!next || next === cursor) throw new Error('push subscription cursor did not advance');
    cursor = next;
  }
}

// Current streak (local days, using each subscription's own zone would be
// overkill here — attempts are stamped UTC and the reminder fires in the
// evening, so UTC days match the learner's days closely enough for a
// motivational count) plus the size of the mistake-review pool.
export async function practiceContext(admin, userIds, now = new Date()) {
  const context = new Map(userIds.map((id) => [id, { streak: 0, reviewCount: 0 }]));
  const since = new Date(now.getTime() - ATTEMPT_WINDOW_DAYS * 86400000).toISOString();
  for (const ids of chunk(userIds, 200)) {
    const { data, error } = await admin
      .from('attempts')
      .select(REVIEW_SELECT)
      .in('user_id', ids)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20000);
    if (error) throw error;
    const byUser = new Map();
    for (const attempt of data || []) {
      if (!byUser.has(attempt.user_id)) byUser.set(attempt.user_id, []);
      byUser.get(attempt.user_id).push(attempt);
    }
    for (const [userId, attempts] of byUser) {
      const days = new Set(attempts.map((attempt) => String(attempt.created_at).slice(0, 10)));
      const cursor = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      const key = (date) => date.toISOString().slice(0, 10);
      if (!days.has(key(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
      let streak = 0;
      while (days.has(key(cursor))) {
        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
      const reviewCount = buildQueue(attempts).reduce(
        (total, entry) => total + entry.missed.length,
        0
      );
      context.set(userId, { streak, reviewCount });
    }
  }
  return context;
}

async function recordSent(admin, subscription, notification, now) {
  const { error } = await admin.from('activity_events').insert({
    anon_id: `push:${subscription.user_id}`,
    user_id: subscription.user_id,
    event: 'push_sent',
    props: {
      source: 'push_reminder',
      notification_id: notification.notificationId,
      streak: notification.streak,
      destination: notification.url,
    },
  });
  if (error) console.error('push_sent event insert failed:', error.message);
  const { error: updateError } = await admin
    .from('push_subscriptions')
    .update({ last_sent_at: now.toISOString(), failures: 0, updated_at: now.toISOString() })
    .eq('id', subscription.id);
  if (updateError) throw updateError;
}

async function recordFailure(admin, subscription, result, now) {
  const gone = result.gone;
  const failures = Number(subscription.failures || 0) + 1;
  const { error } = await admin
    .from('push_subscriptions')
    .update({
      failures,
      enabled: gone ? false : failures < 5,
      disabled_reason: gone ? 'push-gone' : failures >= 5 ? 'too-many-failures' : null,
      updated_at: now.toISOString(),
    })
    .eq('id', subscription.id);
  if (error) throw error;
}

export async function sendDueReminders(
  admin,
  { now = new Date(), send = sendPush, subscriptions = null } = {}
) {
  const all = subscriptions || (await readEnabledSubscriptions(admin));
  const due = dueReminders(all, now);
  const results = { candidates: all.length, due: due.length, sent: 0, failed: 0, disabled: 0 };
  if (!due.length) return results;

  const context = await practiceContext(admin, [...new Set(due.map((row) => row.user_id))], now);
  for (const subscription of due) {
    const stats = context.get(subscription.user_id) || { streak: 0, reviewCount: 0 };
    const copy = reminderNotification(stats);
    const notificationId = `${subscription.id}:${now.toISOString().slice(0, 10)}`;
    const result = await send(subscription, {
      title: copy.title,
      body: copy.body,
      url: copy.url,
      tag: 'daily-reminder',
      notification_id: notificationId,
      endpoint: subscription.endpoint,
      streak: stats.streak,
    });
    if (result?.sent) {
      await recordSent(
        admin,
        subscription,
        { notificationId, streak: stats.streak, url: copy.url },
        now
      );
      results.sent += 1;
    } else {
      await recordFailure(admin, subscription, result || {}, now);
      results.failed += 1;
      if (result?.gone) results.disabled += 1;
    }
  }
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) return res.status(401).end();
  try {
    const results = await sendDueReminders(getAdmin());
    return res.status(200).json(results);
  } catch (error) {
    console.error('push reminder cron failed:', error.message);
    return res.status(500).json({ error: 'Push reminder run failed.' });
  }
}
