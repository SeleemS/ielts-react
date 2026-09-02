export const config = { runtime: 'nodejs' };

// Monday scorecard. Runs via Vercel cron (Mondays 06:00 UTC, see vercel.json),
// guarded by CRON_SECRET like every other cron. Reads the weekly_scorecard()
// RPC — which owns every metric definition, including the MRR method — and
// emails the eight-row table to REPORT_EMAIL via Resend, the same recipient
// and sender as the daily report.
//
// Manual run: GET /api/cron/weekly-scorecard with the same bearer secret.
// Add ?send=0 to compute the scorecard without sending the email.

import { createClient } from '@supabase/supabase-js';
import { renderScorecardEmail, scorecardSubject } from '../../../lib/weeklyScorecard';

async function sendEmail(scorecard) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.REPORT_EMAIL;
  if (!apiKey || !to) return { sent: false, reason: 'email-not-configured' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || process.env.REPORT_FROM || 'IELTS Bank <hello@ielts-bank.com>',
        to: [to],
        subject: scorecardSubject(scorecard),
        html: renderScorecardEmail(scorecard),
      }),
    });
    if (!response.ok) {
      console.error('weekly scorecard email failed:', `resend-${response.status}`);
      return { sent: false, reason: `resend-${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error('weekly scorecard email failed:', error.message);
    return { sent: false, reason: 'resend-request-failed' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) return res.status(401).end();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Scorecard is not configured.' });

  let admin;
  try {
    admin = createClient(url, key, { auth: { persistSession: false } });
  } catch (error) {
    console.error('weekly scorecard client failed:', error.message);
    return res.status(503).json({ error: 'Scorecard is not configured.' });
  }

  try {
    const { data, error } = await admin.rpc('weekly_scorecard');
    if (error) throw error;
    const email =
      req.query?.send === '0'
        ? { sent: false, reason: 'send-disabled' }
        : await sendEmail(data);
    return res.status(200).json({ ok: true, email, scorecard: data });
  } catch (error) {
    console.error('weekly scorecard failed:', error.message);
    return res.status(503).json({ error: 'Scorecard generation failed.' });
  }
}
