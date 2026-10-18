// pages/api/auth/signup-check.js
// Pre-sign-up email check called by SignInDialog before supabase.auth.signUp.
//
//   POST { email } -> 200 { ok: true }
//                   | 200 { ok: false, reason: 'disposable' }
//                   | 200 { ok: false, reason: 'alias', hint: 'ja•••@gmail.com' }
//
// 'alias' means a confirmed account already owns this inbox under another
// spelling (Gmail dots / +tags — public.find_email_alias), so the learner is
// sent to sign in rather than opening a second free account. Only a masked
// hint is returned. Everything else FAILS OPEN: a lookup error, missing
// config or the per-IP rate limit never blocks a real sign-up.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../../lib/apiSecurity';
import { isDisposableEmail, maskEmail } from '../../../lib/emailCheck';

const EMAIL_MAX = 320;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_SECONDS = 3600;
const MAX_PER_WINDOW = 30;

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!originAllowed(req)) {
    return res.status(403).json({ error: 'Requests from this origin are not allowed.' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (isDisposableEmail(email)) {
    return res.status(200).json({ ok: false, reason: 'disposable' });
  }

  try {
    const admin = getAdmin();
    const { data: allowed, error: limitError } = await admin.rpc('check_rate_limit', {
      p_bucket: 'signup-check',
      p_identifier: clientIp(req),
      p_window_seconds: WINDOW_SECONDS,
      p_max: MAX_PER_WINDOW,
    });
    if (limitError || allowed !== true) return res.status(200).json({ ok: true });

    const { data: existing, error } = await admin.rpc('find_email_alias', { p_email: email });
    if (error) {
      console.error('signup-check alias lookup failed:', error.message);
      return res.status(200).json({ ok: true });
    }
    if (typeof existing === 'string' && existing) {
      return res.status(200).json({ ok: false, reason: 'alias', hint: maskEmail(existing) });
    }
  } catch (e) {
    console.error('signup-check failed:', e.message);
  }
  return res.status(200).json({ ok: true });
}
