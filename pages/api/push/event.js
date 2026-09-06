export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { clientIp } from '../../../lib/apiSecurity';

// Click beacon for the daily reminder (docs/ANALYTICS-TRACKING.md: push_sent is
// written by the cron, push_click lands here).
//
// The service worker has no Supabase session and — depending on the browser —
// sends no Origin header, so this route is NOT origin-checked. Instead the
// posted endpoint must match an existing push_subscriptions row, which both
// resolves the user and keeps the route from being a general-purpose event
// injector. IP rate limiting is shared with the rest of the telemetry.
//
// No personal data: the body carries an endpoint and a notification id only.

const EVENTS = new Set(['push_click']);

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseBody(req) {
  let body = req.body;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const body = parseBody(req);
  const event = typeof body.event === 'string' ? body.event : '';
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.slice(0, 1000) : '';
  if (!EVENTS.has(event) || !endpoint) {
    return res.status(400).json({ error: 'Invalid payload.' });
  }

  const admin = getAdmin();
  if (!admin) return res.status(202).json({ ok: true, ignored: true });

  try {
    const { data: allowed, error: limitError } = await admin.rpc('check_rate_limit', {
      p_bucket: 'push-events',
      p_identifier: clientIp(req),
      p_window_seconds: 60,
      p_max: 30,
    });
    if (limitError) throw limitError;
    if (allowed !== true) return res.status(429).json({ error: 'Rate limited.' });

    const { data: subscription, error: lookupError } = await admin
      .from('push_subscriptions')
      .select('user_id')
      .eq('endpoint', endpoint)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!subscription?.user_id) return res.status(202).json({ ok: true, ignored: true });

    const { error } = await admin.from('activity_events').insert({
      anon_id: `push:${subscription.user_id}`,
      user_id: subscription.user_id,
      event,
      props: {
        source: 'push_reminder',
        notification_id:
          typeof body.notification_id === 'string' ? body.notification_id.slice(0, 64) : null,
        streak: Number.isFinite(Number(body.streak)) ? Number(body.streak) : null,
      },
    });
    if (error) throw error;
    return res.status(202).json({ ok: true });
  } catch (error) {
    console.error('push event insert failed:', error?.message || String(error));
    return res.status(503).json({ error: 'Telemetry unavailable.' });
  }
}
