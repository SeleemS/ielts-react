export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

const STORAGE_PAGE_SIZE = 1000;
const STORAGE_REMOVE_BATCH_SIZE = 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) return res.status(401).end();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Cleanup is not configured.' });
  let admin;
  try {
    admin = createClient(url, key, { auth: { persistSession: false } });
  } catch (error) {
    console.error('cleanup client failed:', error.message);
    return res.status(503).json({ error: 'Cleanup is not configured.' });
  }
  const rateCutoff = new Date(Date.now() - 2 * 864e5).toISOString();
  const estimatorCutoff = new Date(Date.now() - 30 * 864e5).toISOString();
  const audioCutoff = Date.now() - 30 * 864e5;
  try {
    const { error: rateError } = await admin
      .from('rate_limits')
      .delete()
      .lt('window_start', rateCutoff);
    if (rateError) throw rateError;
  } catch (error) {
    console.error('rate-limit cleanup failed:', error.message);
    return res.status(503).json({ error: 'Rate-limit cleanup failed.' });
  }

  let estimatorResultsRemoved = 0;
  try {
    const { count, error } = await admin
      .from('estimator_writing_scores')
      .delete({ count: 'exact' })
      .lt('created_at', estimatorCutoff);
    if (error) throw error;
    estimatorResultsRemoved = Number(count) || 0;
  } catch (error) {
    console.error('estimator-result cleanup failed:', error.message);
    return res.status(503).json({ error: 'Estimator result cleanup failed.' });
  }

  let realtimeScoreRequestsRemoved = 0;
  try {
    const { data, error } = await admin.rpc('cleanup_realtime_score_requests');
    if (error) throw error;
    realtimeScoreRequestsRemoved = Number(data) || 0;
  } catch (error) {
    console.error('realtime-score request cleanup failed:', error.message);
    return res.status(503).json({ error: 'Realtime score request cleanup failed.' });
  }

  // Roll up yesterday (plus a 3-day lookback, so a missed run self-heals) into
  // activity_daily*. dashboard_overview reads those rollups for closed days;
  // a failure here only costs the dashboard speed, never accuracy, so it must
  // not abort the rest of the cleanup.
  let activityRollup = null;
  try {
    const { data, error } = await admin.rpc('refresh_activity_daily', { p_from: null });
    if (error) throw error;
    activityRollup = data;
  } catch (error) {
    console.error('activity rollup refresh failed:', error.message);
    activityRollup = { error: 'refresh-failed' };
  }

  let removed = 0;
  try {
    const bucket = admin.storage.from('speaking-uploads');
    const pendingPrefixes = [''];
    const seenPrefixes = new Set(pendingPrefixes);
    const old = [];
    for (let prefixIndex = 0; prefixIndex < pendingPrefixes.length; prefixIndex += 1) {
      const prefix = pendingPrefixes[prefixIndex];
      for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
        const { data, error: listError } = await bucket.list(prefix, {
          limit: STORAGE_PAGE_SIZE,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });
        if (listError) throw listError;
        const files = data || [];
        for (const file of files) {
          if (!file?.name) continue;
          const path = prefix ? `${prefix}/${file.name}` : file.name;
          if (file.id === null) {
            if (!seenPrefixes.has(path)) {
              seenPrefixes.add(path);
              pendingPrefixes.push(path);
            }
          } else if (
            Date.parse(file.created_at || file.updated_at || '') < audioCutoff
          ) {
            old.push(path);
          }
        }
        if (files.length < STORAGE_PAGE_SIZE) break;
      }
    }
    for (let index = 0; index < old.length; index += STORAGE_REMOVE_BATCH_SIZE) {
      const batch = old.slice(index, index + STORAGE_REMOVE_BATCH_SIZE);
      const { error } = await bucket.remove(batch);
      if (error) throw error;
      removed += batch.length;
    }
  } catch (error) {
    console.error('upload cleanup failed:', error.message);
    return res.status(503).json({ error: 'Upload cleanup failed.' });
  }
  return res.status(200).json({
    ok: true,
    recordingsRemoved: removed,
    estimatorResultsRemoved,
    realtimeScoreRequestsRemoved,
    activityRollup,
  });
}
