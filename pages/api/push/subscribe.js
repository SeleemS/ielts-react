export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';
import { validPushEndpoint } from '../../../lib/pushEndpoint';

// Daily-reminder push subscriptions.
//
//   POST   { subscription, reminder_hour_local, time_zone, tz_offset_minutes }
//          upserts the endpoint for the signed-in user and (re-)enables it.
//          Also used to change the reminder time for an existing endpoint.
//   DELETE { endpoint }
//          disables it — the user turned reminders off on this device.
//
// A row only ever exists because the user clicked "Enable daily reminder" and
// then granted the browser permission; nothing here prompts on its own.

const ENDPOINT_MAX = 1000;

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authedUserId(admin, req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  if (!match) return null;
  const { data, error } = await admin.auth.getUser(match[1].trim());
  if (error) return null;
  return data?.user?.id || null;
}

function validEndpoint(value) {
  if (typeof value !== 'string' || value.length > ENDPOINT_MAX) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? value : '';
  } catch {
    return '';
  }
}

function validHour(value, fallback = 19) {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

function validZone(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_+\-/]{1,64}$/.test(value)) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

function validOffset(value) {
  const offset = Number(value);
  // ±14h is the widest real UTC offset.
  return Number.isFinite(offset) && Math.abs(offset) <= 840 ? Math.round(offset) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });

  const admin = getAdmin();
  if (!admin) return res.status(503).json({ error: 'Push is temporarily unavailable.' });

  try {
    const userId = await authedUserId(admin, req);
    if (!userId) return res.status(401).json({ error: 'Sign in required.' });

    const body = req.body || {};

    if (req.method === 'DELETE') {
      const endpoint = validEndpoint(body.endpoint);
      if (!endpoint) return res.status(400).json({ error: 'Invalid subscription.' });
      const { error } = await admin
        .from('push_subscriptions')
        .update({
          enabled: false,
          disabled_reason: 'user-disabled',
          updated_at: new Date().toISOString(),
        })
        .eq('endpoint', endpoint)
        .eq('user_id', userId);
      if (error) throw error;
      return res.status(200).json({ ok: true, enabled: false });
    }

    const subscription = body.subscription || {};
    const endpoint = validPushEndpoint(subscription.endpoint);
    const p256dh = typeof subscription.keys?.p256dh === 'string' ? subscription.keys.p256dh : '';
    const auth = typeof subscription.keys?.auth === 'string' ? subscription.keys.auth : '';
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: 'Invalid subscription.' });
    }

    const row = {
      user_id: userId,
      endpoint,
      keys: { p256dh, auth },
      ua: String(req.headers['user-agent'] || '').slice(0, 300) || null,
      time_zone: validZone(body.time_zone),
      tz_offset_minutes: validOffset(body.tz_offset_minutes),
      reminder_hour_local: validHour(body.reminder_hour_local),
      enabled: true,
      failures: 0,
      disabled_reason: null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin
      .from('push_subscriptions')
      .upsert(row, { onConflict: 'endpoint' })
      .select('endpoint, reminder_hour_local, enabled, time_zone')
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json({ ok: true, subscription: data });
  } catch (error) {
    console.error('push subscribe failed:', error?.message || String(error));
    return res.status(503).json({ error: 'Push is temporarily unavailable.' });
  }
}
