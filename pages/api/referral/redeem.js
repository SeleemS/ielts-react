// pages/api/referral/redeem.js
// Redeems a referral code for the signed-in user. All validation and crediting
// happens atomically in the redeem_referral RPC (service-role only): invalid /
// self / already-redeemed / stale accounts are rejected there, and the
// referrer is capped at 5 credited referrals per month. The client calls this
// once after signup when a ?ref= code was captured; failures are terminal (no
// retries — the client clears its stored code either way).
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';

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
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  if (!match) return res.status(401).json({ error: 'Sign in first.' });

  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toLowerCase() : '';
  if (!/^[a-z0-9]{8}$/.test(code)) {
    return res.status(400).json({ ok: false, reason: 'invalid_code' });
  }

  try {
    const admin = getAdmin();
    const { data: auth, error: authError } = await admin.auth.getUser(match[1].trim());
    if (authError || !auth?.user) return res.status(401).json({ error: 'Sign in first.' });

    const { data, error } = await admin.rpc('redeem_referral', {
      p_code: code,
      p_referred: auth.user.id,
    });
    if (error) throw error;
    return res.status(200).json(data);
  } catch (error) {
    console.error('referral redeem failed:', error.message);
    return res.status(503).json({ error: 'Could not process the referral. Please try again.' });
  }
}
