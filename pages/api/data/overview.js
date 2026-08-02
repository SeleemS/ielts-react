export const config = { runtime: 'nodejs' };

// Historical aggregates for the /data dashboard (dashboard_overview RPC).
// Requires a valid dashboard session cookie (see lib/dataDashAuth.js).

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { requestAuthorized, setPrivateHeaders } from '../../../lib/dataDashAuth';

const RANGES = new Set(['today', '7', '28', '30', '90', 'all']);
// The table's first row is 2026-07-17; 'all' just needs to predate it.
const EPOCH = '2026-07-01T00:00:00.000Z';

let adminClient = null;
function admin() {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

// Local-dev escape hatch: serve captured fixtures when the RPC isn't
// available (e.g. before the migration lands). Never active in production.
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

  const range = RANGES.has(req.query.range) ? req.query.range : '7';
  // offset = how many whole periods to step back (the header's ‹ › stepper).
  const offset = Math.min(24, Math.max(0, Number.parseInt(req.query.offset, 10) || 0));
  const now = new Date();
  let from;
  let to = now;
  let bucket = 'day';
  if (range === 'today') {
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    from = new Date(dayStart - offset * 86400000);
    to = offset === 0 ? now : new Date(dayStart - (offset - 1) * 86400000);
    bucket = 'hour';
  } else if (range === 'all') {
    from = new Date(EPOCH);
  } else {
    const lenMs = Number(range) * 86400000;
    from = new Date(now.getTime() - (offset + 1) * lenMs);
    to = offset === 0 ? now : new Date(now.getTime() - offset * lenMs);
  }
  // Explicit granularity override; hourly is capped to short windows.
  if (req.query.bucket === 'hour' && to.getTime() - from.getTime() <= 8 * 86400000) {
    bucket = 'hour';
  } else if (req.query.bucket === 'day') {
    bucket = 'day';
  }

  try {
    const { data, error } = await admin().rpc('dashboard_overview', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_bucket: bucket,
    });
    if (error) throw error;
    // Crawler telemetry is additive — the dashboard must not fail without it.
    let ai = null;
    try {
      const { data: aiData, error: aiError } = await admin().rpc('dashboard_ai_crawlers', {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (!aiError) ai = aiData;
    } catch {
      /* keep ai = null */
    }
    return res.status(200).json({
      range,
      bucket,
      offset,
      from: from.toISOString(),
      to: to.toISOString(),
      data,
      ai,
    });
  } catch (error) {
    const fallback = fixture('fixture-overview.json');
    if (fallback) return res.status(200).json({ range, bucket, from: from.toISOString(), data: fallback, fixture: true });
    console.error('dashboard_overview failed:', error.message);
    return res.status(503).json({ error: 'Stats unavailable.' });
  }
}
