// scripts/apply-signup-block.mjs
// Run deliberately (never from CI). Applies
// supabase/migrations/20261018140000_signup_block_gmail_dots_disposable.sql to
// the live DB over the session pooler, then runs a behavioural QA inside a
// transaction that is ALWAYS rolled back (synthetic auth users only):
//   1. a throwaway-domain auth user is rejected;
//   2. a Gmail dot / googlemail / +tag look-alike of an existing account is
//      rejected by the mailbox claim;
//   3. the Before User Created hook returns 422 for both.
//
//   node scripts/apply-signup-block.mjs             # apply + verify
//   node scripts/apply-signup-block.mjs --rehearse  # DDL + QA in one tx, rolled back
//   node scripts/apply-signup-block.mjs --check     # QA only

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REHEARSE = process.argv.includes('--rehearse');
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

const url = loadEnvLocal().SUPABASE_DB_SESSION_URL;
if (!url) {
  console.error('SUPABASE_DB_SESSION_URL missing from .env.local');
  process.exit(1);
}
const migration = readFileSync(
  path.join(ROOT, 'supabase/migrations/20261018140000_signup_block_gmail_dots_disposable.sql'),
  'utf8'
);

async function qa(client) {
  const tag = Math.random().toString(36).slice(2, 10);
  const insertUser = async (email) => {
    await client.query('savepoint qa');
    try {
      await client.query(
        `insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), $1, '{}'::jsonb)`,
        [email]
      );
      await client.query('release savepoint qa');
      return 'ok';
    } catch (error) {
      await client.query('rollback to savepoint qa');
      return error.code || error.message;
    }
  };
  const expect = (label, got, want) => {
    if (got !== want) throw new Error(`QA ${label}: expected ${want}, got ${got}`);
    console.log(`  ok  ${label}`);
  };

  expect('throwaway inbox rejected', await insertUser(`qa${tag}@mailinator.com`), '22023');
  expect('throwaway subdomain rejected', await insertUser(`qa${tag}@x.yopmail.com`), '22023');
  expect('first Gmail account allowed', await insertUser(`qa.block.${tag}@gmail.com`), 'ok');
  expect('undotted look-alike rejected', await insertUser(`qablock${tag}@gmail.com`), '23505');
  expect('googlemail +tag look-alike rejected', await insertUser(`q.a.block${tag}+2@googlemail.com`), '23505');
  expect('other domains keep dots', await insertUser(`qa.block.${tag}@school.edu`), 'ok');
  expect('other domain dot variant allowed', await insertUser(`qablock${tag}@school.edu`), 'ok');

  const hook = async (email) =>
    (await client.query(`select public.before_user_created_mailbox_guard($1::jsonb) r`, [
      JSON.stringify({ user: { email } }),
    ])).rows[0].r;
  expect('hook rejects throwaway', (await hook(`n${tag}@mailinator.com`)).error?.http_code, 422);
  expect('hook rejects look-alike', (await hook(`qablock${tag}@gmail.com`)).error?.http_code, 422);
  expect('hook allows a new inbox', JSON.stringify(await hook(`fresh${tag}@gmail.com`)), '{}');
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  if (REHEARSE) {
    await client.query('begin');
    try {
      await client.query(migration);
      await qa(client);
    } finally {
      await client.query('rollback');
    }
    console.log('rehearsal passed: migration + QA ran and were rolled back. Nothing changed.');
  } else {
    if (!CHECK_ONLY) {
      await client.query('begin');
      await client.query(migration);
      await client.query('commit');
      console.log('migration applied');
    }
    await client.query('begin');
    try {
      await qa(client);
    } finally {
      await client.query('rollback');
    }
    console.log('applied + verified: sign-up block live; QA transaction rolled back.');
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('signup block migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
