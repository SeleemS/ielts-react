// scripts/apply-dashboard-cards.mjs
// Applies the two card RPCs that sit on top of the rollups:
//   supabase/migrations/20260901020000_dashboard_retention.sql  (Week-2 return)
//   supabase/migrations/20260901030000_weekly_scorecard.sql     (Monday scorecard)
// then verifies both return the shape the /data cards and the Monday email read.
//
//   node scripts/apply-dashboard-cards.mjs
//
// Run AFTER scripts/apply-dashboard-perf.mjs: weekly_scorecard reads
// activity_window_visitors and dashboard_retention, both of which that
// migration creates. Reads SUPABASE_DB_SESSION_URL from ROOT/.env.local.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const env = {};
  try {
    const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[m[1]] = val;
    }
  } catch {
    /* fall through to process.env */
  }
  return env;
}

const env = loadEnvLocal();
const url = env.SUPABASE_DB_SESSION_URL || process.env.SUPABASE_DB_SESSION_URL;
if (!url) {
  console.error('SUPABASE_DB_SESSION_URL missing from .env.local and the environment');
  process.exit(1);
}

const MIGRATIONS = [
  'supabase/migrations/20260901020000_dashboard_retention.sql',
  'supabase/migrations/20260901030000_weekly_scorecard.sql',
];

const SCORECARD_KEYS = [
  'visitors_per_day', 'ai_google_per_day', 'free_reports_per_day', 'week2_pct',
  'paywall_paid_pct', 'new_payers', 'mrr_usd', 'failed_renewal_pct',
];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("set statement_timeout = '120s'");
  await client.query('begin');
  for (const file of MIGRATIONS) {
    console.log(`applying ${file}…`);
    await client.query(readFileSync(path.join(ROOT, file), 'utf8'));
  }
  await client.query('commit');

  const retStarted = process.hrtime.bigint();
  const retention = (await client.query('select public.dashboard_retention(8) as data')).rows[0].data;
  const retMs = Number(process.hrtime.bigint() - retStarted) / 1e6;

  const scoreStarted = process.hrtime.bigint();
  const scorecard = (await client.query('select public.weekly_scorecard() as data')).rows[0].data;
  const scoreMs = Number(process.hrtime.bigint() - scoreStarted) / 1e6;

  const weeks = Array.isArray(retention?.weeks) ? retention.weeks : [];
  const rows = Array.isArray(scorecard?.rows) ? scorecard.rows : [];
  const rowKeys = rows.map((row) => row.key);
  const missingKeys = SCORECARD_KEYS.filter((key) => !rowKeys.includes(key));
  const badRows = rows.filter(
    (row) => !('value' in row) || !('prev' in row) || !('target' in row) || !row.unit
  );

  console.log(`  dashboard_retention: ${retMs.toFixed(0)} ms · ${weeks.length} cohort weeks · ` +
    `${retention?.pending_weeks ?? '?'} too young · current=${retention?.current?.week2_pct ?? 'none'}%`);
  console.log(`  weekly_scorecard:    ${scoreMs.toFixed(0)} ms · ${rows.length} rows`);
  for (const row of rows) {
    console.log(`    ${String(row.key).padEnd(21)} ${String(row.value ?? '–').padStart(8)} ` +
      `(prev ${String(row.prev ?? '–').padStart(8)}, target ${row.target}${row.invert ? ', lower is better' : ''})`);
  }

  const ok = weeks.length >= 0 && !missingKeys.length && !badRows.length && rows.length === 8;
  if (!ok) {
    console.error('VERIFY FAILED', {
      missingKeys,
      malformedRows: badRows.map((row) => row.key),
      rowCount: rows.length,
    });
    process.exit(1);
  }
  console.log('applied + verified: dashboard_retention and weekly_scorecard return the expected shape.');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
