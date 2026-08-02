// scripts/apply-free-speaking-sample.mjs
// Applies supabase/migrations/20260802200000_free_speaking_sample.sql to the
// live DB over the session pooler and verifies: (a) the new column exists,
// (b) the function comments read v8/v3.
//
//   node scripts/apply-free-speaking-sample.mjs

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
  path.join(ROOT, 'supabase/migrations/20260802200000_free_speaking_sample.sql'),
  'utf8'
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');

  const col = await client.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'user_quotas'
        and column_name = 'free_speaking_score_used_at'`
  );
  const comments = await client.query(
    `select p.proname, d.description
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       left join pg_description d on d.objoid = p.oid
      where n.nspname = 'public'
        and p.proname in ('consume_ai_score', 'refund_ai_score')`
  );
  const consumeV8 = comments.rows.some(
    (row) => row.proname === 'consume_ai_score' && /v8/.test(row.description || '')
  );
  const refundV3 = comments.rows.some(
    (row) => row.proname === 'refund_ai_score' && /v3/.test(row.description || '')
  );
  if (!col.rowCount || !consumeV8 || !refundV3) {
    console.error('VERIFY FAILED', {
      column: Boolean(col.rowCount),
      consumeV8,
      refundV3,
    });
    process.exit(1);
  }
  console.log('applied + verified: free_speaking_score_used_at column, consume v8, refund v3');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
