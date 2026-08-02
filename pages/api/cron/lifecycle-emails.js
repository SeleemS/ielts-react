export const config = { runtime: 'nodejs', maxDuration: 300 };

import { createClient } from '@supabase/supabase-js';
import { posts } from '../../../lib/posts';
import { sendLifecycleEmail } from '../../../lib/lifecycleEmail';
import { isPremiumRow } from '../../../lib/premium';

const AUDIENCE_PAGE_SIZE = 1000;
const QUEUE_BATCH_SIZE = 1000;

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function weekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

async function readAllByCursor(buildQuery, cursorFor) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const { data, error } = await buildQuery(cursor);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < AUDIENCE_PAGE_SIZE) return rows;
    const nextCursor = cursorFor(page[page.length - 1]);
    if (!nextCursor || nextCursor === cursor) {
      throw new Error('lifecycle audience cursor did not advance');
    }
    cursor = nextCursor;
  }
}

async function insertQueueRows(admin, rows) {
  let insertedCount = 0;
  for (let index = 0; index < rows.length; index += QUEUE_BATCH_SIZE) {
    const batch = rows.slice(index, index + QUEUE_BATCH_SIZE);
    const { data: inserted, error } = await admin
      .from('lifecycle_emails')
      .upsert(batch, { onConflict: 'idempotency_key', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    insertedCount += inserted?.length || 0;
  }
  return insertedCount;
}

export async function queueWeeklyDigest(admin, force = false, now = new Date()) {
  if (!force && now.getUTCDay() !== 1) return 0;
  const subscribers = await readAllByCursor(
    (after) => {
      let query = admin
        .from('newsletter_subscribers')
        .select('email')
        .eq('confirmed', true)
        .is('unsubscribed_at', null)
        .order('email', { ascending: true });
      if (after) query = query.gt('email', after);
      return query.limit(AUDIENCE_PAGE_SIZE);
    },
    (subscriber) => subscriber.email
  );
  if (!subscribers.length) return 0;

  const users = await readAllByCursor(
    (after) => {
      let query = admin
        .from('users')
        .select('id, email, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until')
        .not('email', 'is', null)
        .order('id', { ascending: true });
      if (after) query = query.gt('id', after);
      return query.limit(AUDIENCE_PAGE_SIZE);
    },
    (user) => user.id
  );
  const usersByEmail = new Map(users.map((user) => [user.email?.toLowerCase(), user]));

  // Personalization pass: subscribers WITH practice in the last 7 days get a
  // weekly_progress email built from their own attempts (sessions, skills,
  // streak) instead of the generic latest-post digest.
  const subscriberIds = subscribers
    .map(({ email }) => usersByEmail.get(email.toLowerCase())?.id)
    .filter(Boolean);
  const weekAgoIso = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const activity = new Map(); // userId -> { sessions:Set(dayKey), skills:Map, allDays:Set }
  for (const ids of chunk(subscriberIds, 200)) {
    const { data: attempts, error: attemptError } = await admin
      .from('attempts')
      .select('user_id, skill, created_at')
      .in('user_id', ids)
      .gte('created_at', new Date(now.getTime() - 40 * DAY_MS).toISOString())
      .limit(20000);
    if (attemptError) throw attemptError;
    for (const attempt of attempts || []) {
      if (!activity.has(attempt.user_id)) {
        activity.set(attempt.user_id, { recent: 0, skills: new Map(), days: new Set() });
      }
      const entry = activity.get(attempt.user_id);
      entry.days.add(String(attempt.created_at).slice(0, 10));
      if (attempt.created_at >= weekAgoIso) {
        entry.recent += 1;
        if (attempt.skill) {
          entry.skills.set(attempt.skill, (entry.skills.get(attempt.skill) || 0) + 1);
        }
      }
    }
  }
  const streakFor = (days) => {
    let streak = 0;
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (!days.has(utcDateKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (days.has(utcDateKey(cursor))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return streak;
  };

  const latest = posts[0];
  const key = weekKey(now);
  const rows = subscribers.map(({ email }) => {
    const user = usersByEmail.get(email.toLowerCase());
    const premium = isPremiumRow(user, now.getTime());
    const stats = user?.id ? activity.get(user.id) : null;
    if (stats && stats.recent > 0) {
      const skillsLine = [...stats.skills.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([skill, count]) => `${count} ${skill}`)
        .join(', ');
      return {
        user_id: user.id,
        recipient_email: email.toLowerCase(),
        email_type: 'weekly_progress',
        idempotency_key: `weekly_progress:${key}:${email.toLowerCase()}`,
        payload: {
          plan: premium ? 'premium' : 'free',
          sessions: stats.recent,
          skills_line: skillsLine,
          streak: streakFor(stats.days),
        },
      };
    }
    return {
      user_id: user?.id || null,
      recipient_email: email.toLowerCase(),
      email_type: 'weekly_digest',
      idempotency_key: `weekly_digest:${key}:${email.toLowerCase()}`,
      payload: {
        plan: premium ? 'premium' : 'free',
        subject: `This week: ${latest?.title || 'your IELTS practice plan'}`,
        title: latest?.title || 'Your weekly IELTS practice plan',
        intro: latest?.excerpt || 'Practise one weak skill under a real time limit this week.',
        cta_label: latest ? 'Read the guide' : 'Open my dashboard',
        cta_href: latest
          ? `https://www.ielts-bank.com/blog/${latest.slug}`
          : 'https://www.ielts-bank.com/dashboard',
      },
    };
  });
  return insertQueueRows(admin, rows);
}

export async function queueWinBack(admin, now = new Date()) {
  if (!process.env.STRIPE_WINBACK_COUPON_ID) return 0;
  const cutoff = new Date(now.getTime() - 30 * 86400000).toISOString();
  const users = await readAllByCursor(
    (after) => {
      let query = admin
        .from('users')
        .select('id, email, canceled_at')
        .eq('plan', 'free')
        .not('email', 'is', null)
        .lte('canceled_at', cutoff)
        .order('id', { ascending: true });
      if (after) query = query.gt('id', after);
      return query.limit(AUDIENCE_PAGE_SIZE);
    },
    (user) => user.id
  );
  const rows = users.map((user) => ({
    user_id: user.id,
    recipient_email: user.email.toLowerCase(),
    email_type: 'win_back',
    idempotency_key: `win_back:${user.id}:${String(user.canceled_at).slice(0, 10)}`,
    payload: { canceled_at: user.canceled_at },
  }));
  if (!rows.length) return 0;
  return insertQueueRows(admin, rows);
}

const DAY_MS = 86400000;

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// D-30/14/7/2 reminders keyed to the exam date users set at onboarding.
// Service email (countdown + practice CTA, no sales pitch) — the user gave us
// the date expecting the product to use it.
const COUNTDOWN_DAYS = [30, 14, 7, 2];

export async function queueExamCountdown(admin, now = new Date()) {
  const targets = new Map(
    COUNTDOWN_DAYS.map((days) => [utcDateKey(new Date(now.getTime() + days * DAY_MS)), days])
  );
  const { data, error } = await admin
    .from('users')
    .select('id, email, exam_date, target_band')
    .in('exam_date', [...targets.keys()])
    .not('email', 'is', null);
  if (error) throw error;
  const rows = (data || []).map((user) => {
    const days = targets.get(String(user.exam_date));
    return {
      user_id: user.id,
      recipient_email: user.email.toLowerCase(),
      email_type: 'exam_countdown',
      idempotency_key: `exam_countdown:${user.id}:${days}:${user.exam_date}`,
      payload: { days_left: days, exam_date: user.exam_date, target_band: user.target_band },
    };
  });
  if (!rows.length) return 0;
  return insertQueueRows(admin, rows);
}

// Keeps only ids whose users row is currently NOT premium (so paid users never
// get an upgrade nudge queued after the fact).
async function filterToFreeUsers(admin, userIds, nowMs) {
  const free = [];
  for (const ids of chunk(userIds, 200)) {
    const { data, error } = await admin
      .from('users')
      .select('id, email, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until')
      .in('id', ids)
      .not('email', 'is', null);
    if (error) throw error;
    for (const user of data || []) {
      if (!isPremiumRow(user, nowMs)) free.push(user);
    }
  }
  return free;
}

// Distinct latest event rows per user for an event name inside a window.
async function latestEventPerUser(admin, eventName, fromIso, toIso) {
  const { data, error } = await admin
    .from('activity_events')
    .select('user_id, skill, props, created_at')
    .eq('event', eventName)
    .not('user_id', 'is', null)
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  const byUser = new Map();
  for (const row of data || []) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, row);
  }
  return byUser;
}

// T+2h after a checkout_start with no purchase. Soft-opt-in basis: the user
// initiated the transaction; the email restates the guarantee, no discount.
export async function queueCheckoutAbandoned(admin, now = new Date()) {
  const events = await latestEventPerUser(
    admin,
    'checkout_start',
    new Date(now.getTime() - 26 * 3600000).toISOString(),
    new Date(now.getTime() - 2 * 3600000).toISOString()
  );
  if (!events.size) return 0;
  const freeUsers = await filterToFreeUsers(admin, [...events.keys()], now.getTime());
  const rows = freeUsers.map((user) => {
    const event = events.get(user.id);
    const source = event?.props?.source;
    return {
      user_id: user.id,
      recipient_email: user.email.toLowerCase(),
      email_type: 'checkout_abandoned',
      idempotency_key: `checkout_abandoned:${user.id}:${utcDateKey(new Date(event.created_at))}`,
      payload: {
        upgrade: ['writing', 'speaking', 'mock'].includes(source) ? source : '',
        sku: event?.props?.sku || null,
      },
    };
  });
  if (!rows.length) return 0;
  return insertQueueRows(admin, rows);
}

// T+24h after a paywall impression with no purchase (marketing — suppressed
// for non-subscribers by deliverDue). Skips users already queued for a
// checkout_abandoned in the last 3 days so nobody gets back-to-back nudges.
export async function queuePaywallFollowup(admin, now = new Date()) {
  const events = await latestEventPerUser(
    admin,
    'premium_gate',
    new Date(now.getTime() - 48 * 3600000).toISOString(),
    new Date(now.getTime() - 24 * 3600000).toISOString()
  );
  if (!events.size) return 0;
  const freeUsers = await filterToFreeUsers(admin, [...events.keys()], now.getTime());
  if (!freeUsers.length) return 0;
  const { data: recentNudges, error: nudgeError } = await admin
    .from('lifecycle_emails')
    .select('user_id')
    .eq('email_type', 'checkout_abandoned')
    .gte('created_at', new Date(now.getTime() - 3 * DAY_MS).toISOString())
    .in('user_id', freeUsers.map((user) => user.id));
  if (nudgeError) throw nudgeError;
  const skip = new Set((recentNudges || []).map((row) => row.user_id));
  const rows = freeUsers
    .filter((user) => !skip.has(user.id))
    .map((user) => {
      const event = events.get(user.id);
      const skill = event?.skill || event?.props?.skill;
      return {
        user_id: user.id,
        recipient_email: user.email.toLowerCase(),
        email_type: 'paywall_followup',
        idempotency_key: `paywall_followup:${user.id}:${utcDateKey(new Date(event.created_at))}`,
        payload: { skill: skill === 'speaking' ? 'speaking' : 'writing' },
      };
    });
  if (!rows.length) return 0;
  return insertQueueRows(admin, rows);
}

// Streak about to break: practiced yesterday (UTC), nothing today, streak >= 3.
// Evaluated once daily at 17:00 UTC (evening for the South/Southeast Asia
// audience). Marketing — suppressed for non-subscribers.
export async function queueStreakAtRisk(admin, now = new Date(), force = false) {
  if (!force && now.getUTCHours() !== 17) return 0;
  const todayStart = new Date(`${utcDateKey(now)}T00:00:00.000Z`);
  const windowStart = new Date(todayStart.getTime() - 40 * DAY_MS);
  const { data, error } = await admin
    .from('attempts')
    .select('user_id, created_at')
    .not('user_id', 'is', null)
    .gte('created_at', windowStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(20000);
  if (error) throw error;
  const daysByUser = new Map();
  for (const row of data || []) {
    const key = String(row.created_at).slice(0, 10);
    if (!daysByUser.has(row.user_id)) daysByUser.set(row.user_id, new Set());
    daysByUser.get(row.user_id).add(key);
  }
  const todayKey = utcDateKey(todayStart);
  const yesterdayKey = utcDateKey(new Date(todayStart.getTime() - DAY_MS));
  const atRisk = [];
  for (const [userId, days] of daysByUser) {
    if (days.has(todayKey) || !days.has(yesterdayKey)) continue;
    let streak = 0;
    for (let offset = 1; ; offset += 1) {
      const key = utcDateKey(new Date(todayStart.getTime() - offset * DAY_MS));
      if (!days.has(key)) break;
      streak += 1;
    }
    if (streak >= 3) atRisk.push({ userId, streak });
  }
  if (!atRisk.length) return 0;
  const emails = new Map();
  for (const ids of chunk(atRisk.map((entry) => entry.userId), 200)) {
    const { data: users, error: userError } = await admin
      .from('users')
      .select('id, email')
      .in('id', ids)
      .not('email', 'is', null);
    if (userError) throw userError;
    for (const user of users || []) emails.set(user.id, user.email);
  }
  const rows = atRisk
    .filter((entry) => emails.has(entry.userId))
    .map((entry) => ({
      user_id: entry.userId,
      recipient_email: emails.get(entry.userId).toLowerCase(),
      email_type: 'streak_at_risk',
      idempotency_key: `streak_at_risk:${entry.userId}:${todayKey}`,
      payload: { streak: entry.streak },
    }));
  if (!rows.length) return 0;
  return insertQueueRows(admin, rows);
}

// Day-2 onboarding: users created 24-48h ago who made at least one attempt.
// Service email (practice plan only, no sales pitch).
const SKILL_ROTATION = ['listening', 'reading', 'writing', 'speaking'];

export async function queueDay2Plan(admin, now = new Date()) {
  const { data, error } = await admin
    .from('users')
    .select('id, email, created_at')
    .gte('created_at', new Date(now.getTime() - 48 * 3600000).toISOString())
    .lt('created_at', new Date(now.getTime() - 24 * 3600000).toISOString())
    .not('email', 'is', null);
  if (error) throw error;
  if (!data?.length) return 0;
  const rows = [];
  for (const ids of chunk(data.map((user) => user.id), 200)) {
    const { data: attempts, error: attemptError } = await admin
      .from('attempts')
      .select('user_id, skill, created_at')
      .in('user_id', ids)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (attemptError) throw attemptError;
    const bySkill = new Map();
    for (const attempt of attempts || []) {
      if (!bySkill.has(attempt.user_id)) bySkill.set(attempt.user_id, attempt.skill);
    }
    for (const user of data.filter((entry) => ids.includes(entry.id))) {
      const practiced = bySkill.get(user.id);
      if (!practiced) continue; // no attempt yet — welcome_signup already covers them
      const next = SKILL_ROTATION.find((skill) => skill !== practiced) || 'listening';
      rows.push({
        user_id: user.id,
        recipient_email: user.email.toLowerCase(),
        email_type: 'day2_first_week_plan',
        idempotency_key: `day2_first_week_plan:${user.id}`,
        payload: { practiced_skill: practiced, next_skill: next },
      });
    }
  }
  if (!rows.length) return 0;
  return insertQueueRows(admin, rows);
}

const MARKETING_EMAIL_TYPES = new Set([
  'weekly_digest',
  'win_back',
  'paywall_followup',
  'weekly_progress',
  'streak_at_risk',
]);
const STALE_CLAIM_MINUTES = 15;

export async function recipientAllowsMarketing(admin, email) {
  const { data, error } = await admin
    .from('newsletter_subscribers')
    .select('email')
    .eq('email', String(email || '').trim().toLowerCase())
    .eq('confirmed', true)
    .is('unsubscribed_at', null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function reclaimStaleDeliveries(admin, now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from('lifecycle_emails')
    .update({
      status: 'failed',
      last_error: 'delivery-claim-expired',
      updated_at: now.toISOString(),
    })
    .eq('status', 'sending')
    .is('sent_at', null)
    .lt('updated_at', cutoff)
    .select('id');
  if (error) throw error;
  return data?.length || 0;
}

export async function deliverDue(admin, { send = sendLifecycleEmail, now = new Date() } = {}) {
  const reclaimed = await reclaimStaleDeliveries(admin, now);
  const { data: due, error } = await admin
    .from('lifecycle_emails')
    .select('*')
    .in('status', ['pending', 'failed'])
    .is('sent_at', null)
    .lte('scheduled_for', now.toISOString())
    .lt('attempts', 5)
    .order('scheduled_for')
    .limit(50);
  if (error) throw error;

  const results = { sent: 0, failed: 0, suppressed: 0, skipped: 0, reclaimed };
  for (const row of due || []) {
    if (
      MARKETING_EMAIL_TYPES.has(row.email_type) &&
      !(await recipientAllowsMarketing(admin, row.recipient_email))
    ) {
      const { data: suppressed, error: suppressError } = await admin
        .from('lifecycle_emails')
        .update({
          status: 'suppressed',
          last_error: 'recipient-not-subscribed',
          updated_at: now.toISOString(),
        })
        .eq('id', row.id)
        .in('status', ['pending', 'failed'])
        .select('id')
        .maybeSingle();
      if (suppressError) throw suppressError;
      if (suppressed) results.suppressed += 1;
      else results.skipped += 1;
      continue;
    }

    const { data: claimed, error: claimError } = await admin
      .from('lifecycle_emails')
      .update({ status: 'sending', attempts: row.attempts + 1, updated_at: now.toISOString() })
      .eq('id', row.id)
      .in('status', ['pending', 'failed'])
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) {
      results.skipped += 1;
      continue;
    }
    let sent;
    try {
      sent = await send(row);
    } catch (error) {
      const detail = String(error?.message || 'provider request failed')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
      sent = { sent: false, reason: `delivery-error: ${detail}` };
    }
    if (sent?.sent) {
      const { error: sentUpdateError } = await admin
        .from('lifecycle_emails')
        .update({
          status: 'sent',
          sent_at: now.toISOString(),
          provider_id: sent.providerId,
          last_error: null,
          updated_at: now.toISOString(),
        })
        .eq('id', row.id);
      if (sentUpdateError) throw sentUpdateError;
      results.sent += 1;
    } else {
      const { error: failedUpdateError } = await admin
        .from('lifecycle_emails')
        .update({
          status: 'failed',
          last_error: sent?.reason || 'delivery-failed',
          updated_at: now.toISOString(),
        })
        .eq('id', row.id);
      if (failedUpdateError) throw failedUpdateError;
      results.failed += 1;
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
    const admin = getAdmin();
    const [
      weeklyQueued,
      winBackQueued,
      examCountdownQueued,
      checkoutAbandonedQueued,
      paywallFollowupQueued,
      streakAtRiskQueued,
      day2Queued,
    ] = await Promise.all([
      queueWeeklyDigest(admin, req.query.weekly === '1'),
      queueWinBack(admin),
      queueExamCountdown(admin),
      queueCheckoutAbandoned(admin),
      queuePaywallFollowup(admin),
      queueStreakAtRisk(admin, new Date(), req.query.streak === '1'),
      queueDay2Plan(admin),
    ]);
    const delivery = await deliverDue(admin);
    return res.status(200).json({
      weeklyQueued,
      winBackQueued,
      examCountdownQueued,
      checkoutAbandonedQueued,
      paywallFollowupQueued,
      streakAtRiskQueued,
      day2Queued,
      ...delivery,
    });
  } catch (error) {
    console.error('lifecycle email cron failed:', error.message);
    return res.status(500).json({ error: 'Lifecycle email run failed.' });
  }
}
