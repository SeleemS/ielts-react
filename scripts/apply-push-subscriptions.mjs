// scripts/apply-push-subscriptions.mjs
// Applies supabase/migrations/20260902000000_push_subscriptions.sql to the live
// DB over the session pooler and verifies the table, its unique endpoint
// constraint, RLS + owner-select policy, and the grants.
//
//   node scripts/apply-push-subscriptions.mjs

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
  path.join(ROOT, 'supabase/migrations/20260902000000_push_subscriptions.sql'),
  'utf8'
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');

  const table = await client.query(
    `select c.relrowsecurity as rls
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'push_subscriptions'`
  );
  const columns = await client.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'push_subscriptions'`
  );
  const unique = await client.query(
    `select 1 from pg_indexes
      where schemaname = 'public' and tablename = 'push_subscriptions'
        and indexdef ilike '%unique%' and indexdef ilike '%endpoint%'`
  );
  const policy = await client.query(
    `select policyname from pg_policies
      where schemaname = 'public' and tablename = 'push_subscriptions'`
  );
  const grants = await client.query(
    `select grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'push_subscriptions'
        and grantee in ('anon', 'authenticated', 'service_role')`
  );

  const names = new Set(columns.rows.map((row) => row.column_name));
  const required = [
    'user_id',
    'endpoint',
    'keys',
    'ua',
    'time_zone',
    'tz_offset_minutes',
    'reminder_hour_local',
    'enabled',
    'failures',
    'created_at',
    'last_sent_at',
  ];
  const missing = required.filter((column) => !names.has(column));
  const anonGrants = grants.rows.filter((row) => row.grantee === 'anon');
  const authenticatedGrants = grants.rows
    .filter((row) => row.grantee === 'authenticated')
    .map((row) => row.privilege_type);

  const ok =
    table.rows[0]?.rls === true &&
    !missing.length &&
    unique.rowCount === 1 &&
    policy.rows.some((row) => row.policyname === 'push_subscriptions_select_own') &&
    anonGrants.length === 0 &&
    authenticatedGrants.every((privilege) => privilege === 'SELECT');

  if (!ok) {
    console.error('VERIFY FAILED', {
      rls: table.rows[0]?.rls,
      missingColumns: missing,
      uniqueEndpointIndex: unique.rowCount,
      policies: policy.rows.map((row) => row.policyname),
      anonGrants: anonGrants.length,
      authenticatedGrants,
    });
    process.exit(1);
  }
  console.log(
    'applied + verified: push_subscriptions table, unique endpoint index, RLS owner-select, service-role-only writes.'
  );
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
