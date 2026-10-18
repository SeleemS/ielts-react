// scripts/apply-free-practice-cap.mjs
// Run deliberately (never from CI). Applies
// supabase/migrations/20261018120000_free_practice_cap.sql to the live DB over
// the session pooler, then runs a behavioural QA inside a transaction that is
// ALWAYS rolled back (one synthetic QA auth/user record; no customer row is
// touched). The QA inserts as the `authenticated` role with a forged JWT sub,
// exactly like a browser insert through PostgREST:
//   1-3. three new passages      -> allowed
//   4.   retry of passage 1      -> allowed
//   5.   a 4th new passage       -> rejected with SQLSTATE PT402
//   6.   same, but as a pass holder -> allowed
//   7.   a service-role-style insert (no JWT) over the cap -> allowed
//
//   node scripts/apply-free-practice-cap.mjs           # apply + verify
//   node scripts/apply-free-practice-cap.mjs --check   # verify only, no DDL
//   node scripts/apply-free-practice-cap.mjs --rehearse # DDL + QA in one tx, rolled back
//
// Rollback: drop trigger if exists attempts_free_practice_cap on public.attempts;

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHECK_ONLY = process.argv.includes('--check');
const REHEARSE = process.argv.includes('--rehearse');

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
  path.join(ROOT, 'supabase/migrations/20261018120000_free_practice_cap.sql'),
  'utf8'
);

async function triggerInstalled(client) {
  const { rows } = await client.query(
    `select count(*)::int n from pg_trigger
      where tgname = 'attempts_free_practice_cap' and tgrelid = 'public.attempts'::regclass and not tgisinternal`
  );
  return rows[0].n === 1;
}

async function qa(client) {
  const { rows: passages } = await client.query(
    `select id from public.passages where skill = 'reading' order by id limit 4`
  );
  if (passages.length < 4) throw new Error('need 4 reading passages for QA');
  const [p1, p2, p3, p4] = passages.map((p) => p.id);
  const { rows: [{ uid }] } = await client.query('select gen_random_uuid() uid');

  await client.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)`,
    [uid, `practice-cap-qa-${uid}@example.invalid`]
  );
  await client.query('insert into public.users (id) values ($1) on conflict (id) do nothing', [uid]);

  const asBrowser = async (passageId) => {
    await client.query('savepoint qa');
    try {
      await client.query('set local role authenticated');
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: uid, role: 'authenticated' }),
      ]);
      await client.query(
        `insert into public.attempts (user_id, passage_id, skill, responses) values ($1, $2, 'reading', '{}'::jsonb)`,
        [uid, passageId]
      );
      await client.query('release savepoint qa');
      await client.query('reset role');
      return 'ok';
    } catch (error) {
      await client.query('rollback to savepoint qa');
      await client.query('reset role');
      return error.code || error.message;
    }
  };

  const expect = (label, got, want) => {
    if (got !== want) throw new Error(`QA ${label}: expected ${want}, got ${got}`);
    console.log(`  ok  ${label}`);
  };

  expect('1st new passage', await asBrowser(p1), 'ok');
  expect('2nd new passage', await asBrowser(p2), 'ok');
  expect('3rd new passage', await asBrowser(p3), 'ok');
  expect('retry of a used passage', await asBrowser(p1), 'ok');
  expect('4th new passage rejected', await asBrowser(p4), 'PT402');

  await client.query(
    `update public.users set plan = 'premium', plan_status = 'active', plan_sku = 'exam_pass',
            plan_expires_at = now() + interval '7 days' where id = $1`,
    [uid]
  );
  expect('pass holder 4th passage', await asBrowser(p4), 'ok');

  await client.query(
    `update public.users set plan = 'free', plan_status = 'inactive', plan_expires_at = now() - interval '1 day' where id = $1`,
    [uid]
  );
  const { rows: [p5] } = await client.query(
    `select id from public.passages where skill = 'reading' and id not in ($1,$2,$3,$4) limit 1`,
    [p1, p2, p3, p4]
  );
  expect('expired pass blocked again', await asBrowser(p5.id), 'PT402');
  // Service-role JWTs carry no sub, so auth.uid() is null for server writes.
  await client.query(`select set_config('request.jwt.claims', '', true)`);
  await client.query(
    `insert into public.attempts (user_id, passage_id, skill, responses) values ($1, $2, 'reading', '{}'::jsonb)`,
    [uid, p5.id]
  );
  console.log('  ok  server-side insert bypasses the cap');

  // Alias lookup: a confirmed dotted Gmail is found from its undotted +tag form.
  await client.query(
    `update auth.users set email = $2, email_confirmed_at = now() where id = $1`,
    [uid, `qa.cap.${uid.slice(0, 8)}@gmail.com`]
  );
  const { rows: [alias] } = await client.query('select public.find_email_alias($1) hit', [
    `qacap${uid.slice(0, 8)}+x@googlemail.com`,
  ]);
  if (alias.hit !== `qa.cap.${uid.slice(0, 8)}@gmail.com`) throw new Error(`QA alias lookup: got ${alias.hit}`);
  const { rows: [self] } = await client.query('select public.find_email_alias($1) hit', [
    `QA.cap.${uid.slice(0, 8)}@gmail.com`,
  ]);
  if (self.hit !== null) throw new Error('QA alias lookup matched the exact same address');
  console.log('  ok  find_email_alias');
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
    process.exit(0);
  }
  if (!CHECK_ONLY) {
    await client.query('begin');
    await client.query(migration);
    await client.query('commit');
    console.log('migration applied');
  }
  if (!(await triggerInstalled(client))) {
    console.error('VERIFY FAILED: trigger attempts_free_practice_cap is not installed');
    process.exit(1);
  }
  await client.query('begin');
  try {
    await qa(client);
  } finally {
    await client.query('rollback');
  }
  console.log('applied + verified: free practice cap enforced; QA transaction rolled back.');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('free practice cap migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
