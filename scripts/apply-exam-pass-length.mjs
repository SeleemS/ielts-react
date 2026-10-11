// scripts/apply-exam-pass-length.mjs
// Run deliberately (never from CI). Applies
// supabase/migrations/20261011120000_pass_lengths_week_pass.sql (which
// supersedes the never-applied 20260923130000_exam_pass_length.sql) to the live DB over
// the session pooler (same pattern as apply-lifecycle-types-v2.mjs), then:
//   1. verifies billing_private.fulfill_checkout now reads _exam_pass_days and
//      the checkout probe public.billing_exam_pass_days_supported() is live;
//   2. runs supabase/tests/exam_pass_length.sql and supabase/tests/week_pass.sql
//      inside a transaction that is ALWAYS rolled back (synthetic QA user only;
//      no customer row is touched).
//
//   node scripts/apply-exam-pass-length.mjs           # apply + verify
//   node scripts/apply-exam-pass-length.mjs --check   # verify only, no DDL
//
// Refuses to run the DDL if the installed function is not the reviewed
// 30-day version (someone changed it by hand) — reconcile first.
//
// Only AFTER this prints "applied + verified": set NEXT_PUBLIC_EXAM_PASS_DAYS=45
// (and NEXT_PUBLIC_WEEK_PASS=1 once the premium_week_pass Stripe prices exist)
// in Vercel (Production) and redeploy. Copy, checkout metadata and the grant
// all switch together on that deploy.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHECK_ONLY = process.argv.includes('--check');

function loadEnvLocal() {
  const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
  return env;
}

const env = loadEnvLocal();
const url = env.SUPABASE_DB_SESSION_URL;
if (!url) {
  console.error('SUPABASE_DB_SESSION_URL missing from .env.local');
  process.exit(1);
}

const migration = readFileSync(
  path.join(ROOT, 'supabase/migrations/20261011120000_pass_lengths_week_pass.sql'),
  'utf8'
);
const qa = ['exam_pass_length.sql', 'week_pass.sql']
  .map((file) => readFileSync(path.join(ROOT, 'supabase/tests', file), 'utf8'));

async function installedDefinition(client) {
  const { rows } = await client.query(
    `select pg_get_functiondef(p.oid) def
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'billing_private' and p.proname = 'fulfill_checkout'`
  );
  if (rows.length !== 1) throw new Error(`expected one billing_private.fulfill_checkout, found ${rows.length}`);
  return rows[0].def;
}

async function probe(client) {
  const { rows } = await client.query(
    `select to_regprocedure('public.billing_exam_pass_days_supported()') is not null present`
  );
  if (!rows[0].present) return null;
  return (await client.query('select public.billing_exam_pass_days_supported() days')).rows[0].days;
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const before = await installedDefinition(client);
  const alreadyApplied = before.includes('_pass_product');
  if (!CHECK_ONLY && !alreadyApplied) {
    // Either the original hard-coded 30-day body or the reviewed 45-day body.
    if (!before.includes("now() + interval '30 days'") && !before.includes('_exam_pass_days')) {
      throw new Error('installed fulfill_checkout is not a reviewed version; refusing to replace it');
    }
    await client.query('begin');
    await client.query(migration);
    await client.query('commit');
    console.log('migration applied');
  } else if (alreadyApplied) {
    console.log('migration already present; verifying only');
  }

  const after = await installedDefinition(client);
  const days = await probe(client);
  if (!after.includes('_pass_product') || !Array.isArray(days) || !days.includes(45) || !days.includes(7)) {
    console.error('VERIFY FAILED', { readsPassProduct: after.includes('_pass_product'), probe: days });
    process.exit(1);
  }

  // Behavioural check against the real function, always rolled back.
  await client.query('begin');
  try {
    for (const sql of qa) await client.query(sql);
  } finally {
    await client.query('rollback');
  }
  console.log(`applied + verified: fulfill_checkout grants ${days.join('/')} days; QA transaction rolled back.`);
  console.log('Next: set NEXT_PUBLIC_EXAM_PASS_DAYS=45 (and NEXT_PUBLIC_WEEK_PASS=1) in Vercel Production and redeploy.');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('exam pass length migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
