// scripts/apply-free-report-offer-email.mjs
// Run deliberately (never from CI). Applies
// supabase/migrations/20261018160000_lifecycle_free_report_offer.sql and checks
// the lifecycle_emails type constraint accepts 'free_report_offer' (probe row
// inserted in a rolled-back transaction). Apply BEFORE deploying the cron that
// queues the type, or every queue insert fails the hourly run.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]])
);
const migration = readFileSync(path.join(ROOT, 'supabase/migrations/20261018160000_lifecycle_free_report_offer.sql'), 'utf8');
const client = new pg.Client({ connectionString: env.SUPABASE_DB_SESSION_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  await client.query(migration);
  await client.query('commit');
  await client.query('begin');
  try {
    await client.query(
      `insert into public.lifecycle_emails (recipient_email, email_type, idempotency_key, payload)
       values ('probe@example.invalid', 'free_report_offer', 'probe:' || gen_random_uuid(), '{}'::jsonb)`
    );
  } finally {
    await client.query('rollback');
  }
  console.log('applied + verified: lifecycle_emails accepts free_report_offer; probe rolled back.');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('free report offer email migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
