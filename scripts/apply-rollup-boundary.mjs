// scripts/apply-rollup-boundary.mjs
// Applies supabase/migrations/20260902010000_rollup_boundary_pre_epoch.sql
// (activity_rollup_boundary treats pre-epoch days as covered) and times the
// four /data ranges afterwards. Same env pattern as apply-dashboard-perf.mjs.
//
//   node scripts/apply-rollup-boundary.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const env = {};
  try {
    for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      env[m[1]] = val;
    }
  } catch { /* fall back to process.env */ }
  return env;
}

const env = loadEnvLocal();
const url = env.SUPABASE_DB_SESSION_URL || process.env.SUPABASE_DB_SESSION_URL;
if (!url) { console.error('SUPABASE_DB_SESSION_URL missing'); process.exit(1); }

const day = 86400000;
function ranges() {
  const now = new Date();
  return [
    ['7', new Date(now - 7 * day)], ['28', new Date(now - 28 * day)],
    ['90', new Date(now - 90 * day)], ['all', new Date('2026-07-01T00:00:00.000Z')],
  ].map(([key, from]) => ({ key, from, to: now }));
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("set statement_timeout = '120s'");
  const sql = readFileSync(path.join(ROOT, 'supabase/migrations/20260902010000_rollup_boundary_pre_epoch.sql'), 'utf8');
  console.log('applying 20260902010000_rollup_boundary_pre_epoch.sql…');
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');

  for (const r of ranges()) {
    const b = await client.query('select * from public.activity_rollup_boundary($1, $2)', [r.from, r.to]);
    const t0 = process.hrtime.bigint();
    const res = await client.query('select public.dashboard_overview($1, $2, $3) as data', [r.from, r.to, 'day']);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const d = res.rows[0].data || {};
    const visitors = d.kpis?.visitors ?? d.visitors ?? '?';
    console.log(`  ${r.key.padEnd(4)} ${ms.toFixed(0).padStart(6)} ms · boundary closed_from=${b.rows[0].closed_from} roll_to=${b.rows[0].roll_to} · visitors ${JSON.stringify(visitors)}`);
  }
  console.log('applied + verified.');
} catch (e) {
  await client.query('rollback').catch(() => {});
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
