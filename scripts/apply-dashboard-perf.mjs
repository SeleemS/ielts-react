// scripts/apply-dashboard-perf.mjs
// Applies supabase/migrations/20260901010000_dashboard_perf.sql (dashboard_overview
// v8 + the activity_daily* rollups), backfills the rollup from BACKFILL_FROM
// (default 2026-01-01), and prints a before/after timing table for the four
// /data ranges.
//
//   node scripts/apply-dashboard-perf.mjs
//   node scripts/apply-dashboard-perf.mjs --skip-before   # re-run, no baseline
//   node scripts/apply-dashboard-perf.mjs --skip-apply    # time + backfill only
//   node scripts/apply-dashboard-perf.mjs --from 2026-01-01
//
// WHY the backfill starts months before the first event: activity_rollup_boundary
// only trusts a CONTIGUOUS run of watermarked days starting at the range's own
// first day. The 90-day preset starts before 2026-07-01, so a backfill from the
// first event day left that whole window (and its prior-period window) reading
// raw rows — 3.1s on 2026-09-02 while every other range took <300ms. Empty days
// get watermark rows too, so starting the backfill at 2026-01-01 covers every
// preset and every prior-period window from April 2026 onward for good.
//
// Reads SUPABASE_DB_SESSION_URL from ROOT/.env.local (or the environment).
// The timing connection raises statement_timeout to 120s deliberately: the
// point of the "before" column is to see how far past the API's 8s budget the
// old function had drifted, not to reproduce the failure.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKIP_BEFORE = process.argv.includes('--skip-before');
const SKIP_APPLY = process.argv.includes('--skip-apply');

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

const EPOCH = '2026-07-01T00:00:00.000Z';
const fromArg = process.argv.indexOf('--from');
const BACKFILL_FROM = fromArg > -1 && process.argv[fromArg + 1] ? process.argv[fromArg + 1] : '2026-01-01';
if (!/^\d{4}-\d{2}-\d{2}$/.test(BACKFILL_FROM)) {
  console.error(`--from must be YYYY-MM-DD, got ${BACKFILL_FROM}`);
  process.exit(1);
}
// Mirrors pages/api/data/overview.js: same windows the dashboard actually asks for.
function ranges() {
  const now = new Date();
  const day = 86400000;
  return [
    { key: '7', from: new Date(now.getTime() - 7 * day), to: now, bucket: 'day' },
    { key: '28', from: new Date(now.getTime() - 28 * day), to: now, bucket: 'day' },
    { key: '90', from: new Date(now.getTime() - 90 * day), to: now, bucket: 'day' },
    { key: 'all', from: new Date(EPOCH), to: now, bucket: 'day' },
  ];
}

async function timeRanges(client, label) {
  const results = {};
  for (const range of ranges()) {
    const started = process.hrtime.bigint();
    try {
      const res = await client.query(
        'select public.dashboard_overview($1::timestamptz, $2::timestamptz, $3) as data',
        [range.from.toISOString(), range.to.toISOString(), range.bucket]
      );
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const data = res.rows[0]?.data || {};
      results[range.key] = {
        ms,
        visitors: data?.totals?.visitors ?? null,
        events: data?.totals?.events ?? null,
        signups: data?.totals?.signups ?? null,
      };
      console.log(
        `  ${label} ${range.key.padEnd(4)} ${ms.toFixed(0).padStart(7)} ms · ${results[range.key].visitors} visitors · ${results[range.key].events} events`
      );
    } catch (error) {
      results[range.key] = { ms: null, error: error.message };
      console.log(`  ${label} ${range.key.padEnd(4)}   FAILED · ${error.message}`);
    }
  }
  return results;
}

function printTable(before, after) {
  const pad = (value, width) => String(value).padStart(width);
  const fmtMs = (entry) => (entry?.ms == null ? 'n/a' : `${entry.ms.toFixed(0)} ms`);
  const speedup = (b, a) =>
    b?.ms && a?.ms ? `${(b.ms / a.ms).toFixed(1)}x` : b?.ms == null ? 'n/a' : '–';
  console.log('');
  console.log('  range |     before |      after |  speedup | visitors before/after');
  console.log('  ------+------------+------------+----------+----------------------');
  for (const key of ['7', '28', '90', 'all']) {
    const b = before?.[key];
    const a = after?.[key];
    console.log(
      `  ${pad(key, 5)} | ${pad(fmtMs(b), 10)} | ${pad(fmtMs(a), 10)} | ${pad(speedup(b, a), 8)} | ${b?.visitors ?? '–'} / ${a?.visitors ?? '–'}`
    );
  }
  console.log('');
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("set statement_timeout = '120s'");

  let before = null;
  if (!SKIP_BEFORE) {
    console.log('timing dashboard_overview BEFORE the migration…');
    before = await timeRanges(client, 'before');
  }

  if (!SKIP_APPLY) {
    const sql = readFileSync(
      path.join(ROOT, 'supabase/migrations/20260901010000_dashboard_perf.sql'),
      'utf8'
    );
    console.log('applying 20260901010000_dashboard_perf.sql…');
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
  }

  console.log(`backfilling activity_daily* from ${BACKFILL_FROM}…`);
  const backfillStarted = process.hrtime.bigint();
  const backfill = await client.query('select public.refresh_activity_daily($1::date) as result', [
    BACKFILL_FROM,
  ]);
  const backfillMs = Number(process.hrtime.bigint() - backfillStarted) / 1e6;
  console.log(`  ${backfillMs.toFixed(0)} ms ·`, JSON.stringify(backfill.rows[0].result));

  // A gap in the watermark silently sends readers back to raw rows, so make it
  // loud here rather than mysterious later.
  const gaps = await client.query(`
    select count(*)::int as missing
    from generate_series(
      (select min(day) from public.activity_daily_state),
      (current_date - 1), interval '1 day') g(d)
    where not exists (
      select 1 from public.activity_daily_state s where s.day = g.d::date)
  `);
  console.log(`  watermark gaps before today: ${gaps.rows[0].missing}`);

  const counts = await client.query(`
    select
      (select count(*) from public.activity_daily) as daily,
      (select count(*) from public.activity_daily_visitor) as visitors,
      (select count(*) from public.activity_daily_dim) as dims,
      (select count(*) from public.activity_daily_session) as sessions,
      (select count(*) from public.activity_daily_state) as days,
      (select count(*) from public.activity_events) as raw_events
  `);
  console.log('  rollup rows:', JSON.stringify(counts.rows[0]));

  console.log('timing dashboard_overview AFTER the migration…');
  const after = await timeRanges(client, 'after ');

  printTable(before, after);

  // Correctness gate: the JSON shape the /data page destructures must survive.
  const shape = await client.query(
    `select public.dashboard_overview(now() - interval '7 days', now(), 'day') as data`
  );
  const data = shape.rows[0].data;
  const requiredTop = [
    'totals', 'prev_totals', 'series', 'countries', 'breakdowns', 'funnel',
    'areas', 'hour_heatmap', 'session_buckets', 'returning',
  ];
  const requiredTotals = [
    'events', 'visitors', 'engaged_visitors', 'signups', 'submits', 'questions_answered',
    'purchases', 'purchasers', 'payments', 'login_sessions', 'revenue_minor',
    'sessions_total', 'bounce_sessions', 'median_session_secs', 'avg_session_secs',
  ];
  const requiredBreakdowns = [
    'channels', 'referrers', 'campaigns', 'pages_top', 'pages_entry', 'pages_exit',
    'browsers', 'oses', 'devices',
  ];
  const missing = [
    ...requiredTop.filter((key) => !(key in (data || {}))),
    ...requiredTotals.filter((key) => !(key in (data?.totals || {}))).map((k) => `totals.${k}`),
    ...requiredBreakdowns
      .filter((key) => !(key in (data?.breakdowns || {})))
      .map((k) => `breakdowns.${k}`),
  ];
  if (missing.length) {
    console.error('VERIFY FAILED — dashboard_overview lost keys:', missing.join(', '));
    process.exit(1);
  }

  const version = await client.query(`
    select d.description
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_description d on d.objoid = p.oid
    where n.nspname = 'public' and p.proname = 'dashboard_overview'
  `);
  const isV8 = /v8/.test(version.rows[0]?.description || '');
  if (!isV8) {
    console.error('VERIFY FAILED — dashboard_overview is not v8');
    process.exit(1);
  }

  console.log('applied + verified: v8 live, rollups backfilled, JSON shape intact.');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
