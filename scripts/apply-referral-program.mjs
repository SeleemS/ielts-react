// scripts/apply-referral-program.mjs
// Applies supabase/migrations/20260802220000_referral_program.sql to the live
// DB over the session pooler and verifies tables, column, and function
// versions (consume v9, refund v4, redeem + code RPCs present).
//
//   node scripts/apply-referral-program.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

const sql = readFileSync(
  path.join(ROOT, 'supabase/migrations/20260802220000_referral_program.sql'),
  'utf8'
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');

  const tables = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('referral_codes', 'referrals')`
  );
  const col = await client.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'user_quotas'
        and column_name = 'referral_bonus_scores'`
  );
  const fns = await client.query(
    `select p.proname, pg_get_function_identity_arguments(p.oid) as args, d.description
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       left join pg_description d on d.objoid = p.oid
      where n.nspname = 'public'
        and p.proname in ('consume_ai_score', 'refund_ai_score', 'redeem_referral', 'get_or_create_referral_code')`
  );
  const consumeV9 = fns.rows.some(
    (row) => row.proname === 'consume_ai_score' && /v9/.test(row.description || '')
  );
  const refundRows = fns.rows.filter((row) => row.proname === 'refund_ai_score');
  const refundV4 =
    refundRows.length === 1 && /p_referral/.test(refundRows[0].args) && /v4/.test(refundRows[0].description || '');
  const rpcs =
    fns.rows.some((row) => row.proname === 'redeem_referral') &&
    fns.rows.some((row) => row.proname === 'get_or_create_referral_code');

  // Smoke-test code generation via service role path (rolled back).
  await client.query('begin');
  const smoke = await client.query(
    `select lower(substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=ABCDEFGHIJKLMNOPQRSTUVWXYZ', ''), 1, 8)) as sample`
  );
  await client.query('rollback');

  const ok = tables.rowCount === 2 && col.rowCount === 1 && consumeV9 && refundV4 && rpcs;
  if (!ok) {
    console.error('VERIFY FAILED', {
      tables: tables.rowCount,
      column: col.rowCount,
      consumeV9,
      refundV4,
      refundOverloads: refundRows.length,
      rpcs,
    });
    process.exit(1);
  }
  console.log('applied + verified: tables, column, consume v9, single refund v4, RPCs. sample code fragment:', smoke.rows[0].sample);
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
