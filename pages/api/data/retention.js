export const config = { runtime: 'nodejs' };

// Week-2 return rate for the /data dashboard (dashboard_retention RPC):
// weekly verified-signup cohorts with their day 1-7 and day 8-14 return rates.
// Same dashboard session cookie as the other /api/data routes.

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { requestAuthorized, setPrivateHeaders } from '../../../lib/dataDashAuth';

const MAX_WEEKS = 26;
const DEFAULT_WEEKS = 8;

let adminClient = null;
function admin() {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

function fixture(name) {
  if (process.env.NODE_ENV === 'production' || !process.env.DATA_DASH_FIXTURE_DIR) return null;
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.env.DATA_DASH_FIXTURE_DIR, name), 'utf8')
    );
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  setPrivateHeaders(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requestAuthorized(req)) return res.status(401).json({ error: 'Unauthorized.' });

  const requested = Number.parseInt(req.query.weeks, 10);
  const weeks = Number.isFinite(requested)
    ? Math.min(MAX_WEEKS, Math.max(1, requested))
    : DEFAULT_WEEKS;

  try {
    const { data, error } = await admin().rpc('dashboard_retention', { p_weeks: weeks });
    if (error) throw error;
    return res.status(200).json({ at: new Date().toISOString(), weeks, data });
  } catch (error) {
    const fallback = fixture('fixture-retention.json');
    if (fallback) {
      return res.status(200).json({ at: new Date().toISOString(), weeks, data: fallback, fixture: true });
    }
    console.error('dashboard_retention failed:', error.message);
    return res.status(503).json({ error: 'Retention unavailable.' });
  }
}
