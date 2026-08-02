// scripts/apply-speaking-model-answers.mjs
// Applies supabase/migrations/20260802210000_speaking_model_answers.sql to
// the live DB over the session pooler (same pattern as
// apply-lifecycle-types-v2.mjs) and verifies both columns exist by reading
// information_schema back.
//
//   node scripts/apply-speaking-model-answers.mjs

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
  path.join(ROOT, 'supabase/migrations/20260802210000_speaking_model_answers.sql'),
  'utf8'
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  const { rows } = await client.query(
    `select column_name, data_type
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'speaking_details'
        and column_name in ('model_answer_html', 'model_answer_meta')
      order by column_name`
  );
  const found = rows.map((r) => `${r.column_name}:${r.data_type}`);
  const expected = ['model_answer_html', 'model_answer_meta'];
  const missing = expected.filter((c) => !rows.some((r) => r.column_name === c));
  if (missing.length) {
    console.error('VERIFY FAILED — missing columns:', missing.join(', '));
    process.exit(1);
  }
  console.log('applied + verified. columns:', found.join(', '));
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
