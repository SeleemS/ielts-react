export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { EMAIL_PREFS, MARKETING_PREF, STUDY_PLAN_PREF } from '../../../lib/emailPrefs';
import { validPrefUnsubscribeToken, validUnsubscribeToken } from '../../../lib/emailTokens';

// One unsubscribe endpoint for every email we send.
//
//   ?email=&token=                 legacy whole-newsletter link (still live in
//                                  inboxes) — marks newsletter_subscribers
//                                  unsubscribed AND turns marketing off.
//   ?email=&token=&pref=<name>     pref-scoped one-click link used by every
//                                  lifecycle email footer: flips exactly that
//                                  pref on public.users.prefs.
//
// No login, no confirmation step, no dark pattern. GET (the footer link) and
// POST (RFC 8058 List-Unsubscribe-Post one-click) both work.

const PREF_COPY = {
  [STUDY_PLAN_PREF]:
    'You will no longer receive study-plan emails (exam countdown, weekly progress, streak reminders).',
  [MARKETING_PREF]: 'You will no longer receive IELTS Bank tips and offers.',
};

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Merge one pref (plus its audit stamp) into the user's prefs blob.
async function setUserEmailPref(admin, email, pref) {
  const { data, error } = await admin
    .from('users')
    .select('id, prefs')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false; // newsletter-only recipient: nothing to flip here
  const prefs = data.prefs && typeof data.prefs === 'object' ? { ...data.prefs } : {};
  const at = new Date().toISOString();
  prefs[pref] = false;
  prefs[`${pref}_at`] = at;
  prefs.email_consent = {
    ...(prefs.email_consent && typeof prefs.email_consent === 'object' ? prefs.email_consent : {}),
    source: 'unsubscribe_link',
    at,
  };
  const { error: updateError } = await admin.from('users').update({ prefs }).eq('id', data.id);
  if (updateError) throw updateError;
  return true;
}

async function unsubscribeNewsletter(admin, email) {
  const { error } = await admin
    .from('newsletter_subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('email', email);
  if (error) throw error;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  const query = req.query || {};
  const email = typeof query.email === 'string' ? query.email.trim().toLowerCase() : '';
  const token = typeof query.token === 'string' ? query.token : '';
  const pref = typeof query.pref === 'string' ? query.pref : '';

  if (pref && !EMAIL_PREFS.includes(pref)) {
    return res.status(400).send('This unsubscribe link is invalid or expired.');
  }
  const validToken = pref
    ? validPrefUnsubscribeToken(email, pref, token)
    : validUnsubscribeToken(email, token);
  if (!email || !validToken) {
    return res.status(400).send('This unsubscribe link is invalid or expired.');
  }

  const admin = getAdmin();
  if (!admin) return res.status(503).send('Unsubscribe is temporarily unavailable.');
  try {
    if (pref) {
      await setUserEmailPref(admin, email, pref);
      // Marketing consent and the newsletter list are the same promise, so
      // opting out of one opts out of both.
      if (pref === MARKETING_PREF) await unsubscribeNewsletter(admin, email);
    } else {
      await unsubscribeNewsletter(admin, email);
      await setUserEmailPref(admin, email, MARKETING_PREF);
    }
  } catch (error) {
    console.error('unsubscribe update failed:', error?.message || String(error));
    return res.status(503).send('Unsubscribe is temporarily unavailable.');
  }
  return res
    .status(200)
    .send(
      pref
        ? PREF_COPY[pref]
        : 'You have been unsubscribed from IELTS Bank weekly emails.'
    );
}
