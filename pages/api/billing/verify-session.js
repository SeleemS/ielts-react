// Checkout-return safety net. Stripe webhooks remain authoritative, but this
// authenticated endpoint reconciles a paid session immediately when the user
// returns from Checkout so a delayed webhook cannot strand them on Free.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';
import { getStripe, handleStripeEvent } from '../../../lib/billing';
import { fetchPremiumStatus } from '../../../lib/premium';

const VERIFY_WINDOW_SECONDS = 10 * 60;
const VERIFY_MAX_PER_WINDOW = 20;

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

async function resolveUser(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  if (!match) return { user: null, error: null };
  try {
    const { data, error } = await getAdmin().auth.getUser(match[1].trim());
    return {
      user: error ? null : data?.user || null,
      error: null,
    };
  } catch (error) {
    return { user: null, error };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const { user, error: authError } = await resolveUser(req);
  if (authError) {
    console.error('verify-session auth error:', authError.message);
    return res.status(503).json({ error: 'Activation is still processing.' });
  }
  if (!user) return res.status(401).json({ error: 'Sign in first.' });

  const sessionId =
    typeof req.body?.session_id === 'string' ? req.body.session_id.trim() : '';
  if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid checkout session.' });
  }

  try {
    const { data: allowed, error } = await getAdmin().rpc('check_rate_limit', {
      p_bucket: 'billing-verify-session',
      p_identifier: user.id,
      p_window_seconds: VERIFY_WINDOW_SECONDS,
      p_max: VERIFY_MAX_PER_WINDOW,
    });
    if (error) throw error;
    if (!allowed) {
      return res.status(429).json({
        error: 'Too many activation checks. Please wait a few minutes and try again.',
      });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });
    const mappedUserId = session.client_reference_id || session.metadata?.user_id;
    if (mappedUserId !== user.id) {
      return res.status(403).json({ error: 'This checkout belongs to another account.' });
    }
    if (session.status !== 'complete' || session.payment_status === 'unpaid') {
      return res.status(409).json({ error: 'Payment is not complete yet.', status: session.status });
    }

    const outcome = await handleStripeEvent(
      {
        id: `verify:${session.id}`,
        type: 'checkout.session.completed',
        data: { object: session },
      },
      { admin: getAdmin(), stripe }
    );
    if (outcome.startsWith('error:')) {
      return res.status(503).json({ error: 'Activation is still processing.' });
    }
    if (!outcome.startsWith('activated ')) {
      return res.status(409).json({
        active: false,
        error: 'This checkout did not activate Pro access.',
      });
    }
    const premium = await fetchPremiumStatus(getAdmin(), user.id);
    if (premium.error) {
      console.error('verify-session entitlement readback error:', premium.error.message);
      return res.status(503).json({ error: 'Activation is still processing.' });
    }
    if (!premium.isPremium) {
      return res.status(409).json({
        active: false,
        error: 'Pro access is not active for this checkout.',
      });
    }
    // Purchase facts for client-side analytics (GA4 purchase event): what
    // Stripe actually charged, not the display price.
    return res.status(200).json({
      active: true,
      outcome,
      sku: session.metadata?.sku || null,
      ppp: session.metadata?.ppp === '1',
      amount_total: Number.isFinite(session.amount_total) ? session.amount_total : null,
      currency: session.currency || null,
    });
  } catch (error) {
    console.error('verify-session error:', error.message);
    return res.status(503).json({ error: 'Activation is still processing.' });
  }
}
