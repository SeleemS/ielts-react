// scripts/apply-lifecycle-types-v2.mjs
// Applies supabase/migrations/20260802190000_lifecycle_email_types_v2.sql to
// the live DB over the session pooler (same pattern as
// apply-returning-visitors-migration.mjs) and verifies the widened CHECK by
// reading the constraint definition back.
//
//   node scripts/apply-lifecycle-types-v2.mjs

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
  path.join(ROOT, 'supabase/migrations/20260802190000_lifecycle_email_types_v2.sql'),
  'utf8'
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  const { rows } = await client.query(
    `select pg_get_constraintdef(oid) as def
       from pg_constraint
      where conname = 'lifecycle_emails_email_type_check'`
  );
  const def = rows[0]?.def || '';
  const expected = [
    'exam_countdown',
    'checkout_abandoned',
    'paywall_followup',
    'weekly_progress',
    'streak_at_risk',
    'day2_first_week_plan',
  ];
  const missing = expected.filter((type) => !def.includes(type));
  if (missing.length) {
    console.error('VERIFY FAILED — missing types in constraint:', missing.join(', '));
    process.exit(1);
  }
  console.log('applied + verified. constraint now:', def.slice(0, 300));
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
