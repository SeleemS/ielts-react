// Real separate-connection race verification in isolated, empty QA schemas.
// Reads installed function definitions/schema metadata, never customer rows.
// Usage: node scripts/verify-billing-concurrency.mjs --run-isolated
// Credentials are loaded locally and never printed. Exact generated schemas
// are removed in finally; the QA account's real entitlement is never touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';

if (!process.argv.includes('--run-isolated')) throw new Error('Explicit --run-isolated flag required');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const connectionString = env.SUPABASE_DB_SESSION_URL || env.SUPABASE_DB_URL;
if (!connectionString) throw new Error('Database session connection not configured');
const nonce = randomUUID().replaceAll('-', '');
const fixture = `qa_bill_${nonce}`;
const internal = `qa_bill_private_${nonce}`;
assert(/^[a-z0-9_]+$/.test(fixture) && /^[a-z0-9_]+$/.test(internal));
const quote = name => `"${name}"`;
const admin = new pg.Client({ connectionString });
const first = new pg.Client({ connectionString });
const second = new pg.Client({ connectionString });
const report = {
  testedAt: new Date().toISOString(),
  method: 'Separate PostgreSQL connections, SET LOCAL ROLE service_role, isolated empty schema clones of installed billing functions',
  customerRowsReadOrChanged: 0,
  stripeRequests: 0,
  races: [],
};
const tables = ['users', 'user_quotas', 'billing_checkout_policy', 'billing_checkout_fulfillments',
  'billing_subscription_events', 'billing_current_purchases', 'billing_purchase_revocations'];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalize = text => text.replaceAll(`${internal}.`, 'billing_private.').replaceAll(`${fixture}.`, 'public.');
const cloned = text => text.replaceAll('billing_private.', `${internal}.`).replaceAll('public.', `${fixture}.`);
let created = false;
let failure;

async function begin(client) {
  await client.query('begin');
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '10s'");
  await client.query('set local role service_role');
}
async function createUser() {
  const id = randomUUID();
  await admin.query(`insert into ${fixture}.users(id) values($1)`, [id]);
  return id;
}
async function grant(client, user, session, fields, timestamp) {
  return (await client.query(`select ${fixture}.fulfill_checkout($1,$2,$3,$4,3600) result`,
    [session, user, timestamp, fields])).rows[0].result;
}
async function subscription(client, user, eventKey, fields, timestamp, invoiceTime = null, quota = null, replace = false) {
  return (await client.query(`select ${fixture}.apply_subscription_billing_event($1,$2,$3,$4,$5,$6,$7,$8) result`,
    [eventKey, user, fields.premium_since, timestamp, fields, replace, quota, invoiceTime])).rows[0].result;
}
async function revoke(client, user, key, sub = null, provider = null) {
  return (await client.query(`select ${fixture}.revoke_billing_purchase($1,$2,$3,'ch_synthetic_qa','refund',$4) result`,
    [user, key, sub, provider])).rows[0].result;
}
async function state(user) {
  return (await admin.query(`select u.plan,u.plan_status,u.plan_sku,u.stripe_subscription_id,
    u.plan_expires_at,q.realtime_seconds_remaining,p.purchase_key,
    (select count(*)::int from ${fixture}.billing_checkout_fulfillments f where f.user_id=u.id) checkout_receipts,
    (select count(*)::int from ${fixture}.billing_subscription_events e where e.user_id=u.id) subscription_receipts,
    (select count(*)::int from ${fixture}.billing_purchase_revocations r where r.user_id=u.id) revocations
    from ${fixture}.users u left join ${fixture}.user_quotas q on q.user_id=u.id
    left join ${fixture}.billing_current_purchases p on p.user_id=u.id where u.id=$1`, [user])).rows[0];
}
async function race(name, user, operation1, operation2, verify, { rollbackFirst = false, afterFirst } = {}) {
  await begin(first);
  await begin(second);
  try {
    const firstPid = (await first.query('select pg_backend_pid() pid')).rows[0].pid;
    const secondPid = (await second.query('select pg_backend_pid() pid')).rows[0].pid;
    assert.notEqual(firstPid, secondPid, 'Race must use separate PostgreSQL backends');
    const result1 = await operation1(first);
    if (afterFirst) await afterFirst(first);
    let settled = false;
    const pending = operation2(second).then(value => { settled = true; return { value }; }, error => { settled = true; return { error }; });
    let lockObserved = false;
    for (let i = 0; i < 30 && !settled; i++) {
      const result = await admin.query('select $1::int = any(pg_blocking_pids($2::int)) blocked', [firstPid, secondPid]);
      if (result.rows[0].blocked) { lockObserved = true; break; }
      await delay(30);
    }
    if (settled && !lockObserved) {
      const early = await pending;
      if (early.error) throw early.error;
    }
    assert.equal(lockObserved, true, `${name}: second connection did not block on first`);
    await first.query(rollbackFirst ? 'rollback' : 'commit');
    const result2 = await pending;
    if (result2.error) throw result2.error;
    await second.query('commit');
    const final = await state(user);
    verify(final, result1, result2.value);
    report.races.push({ name, passed: true, separateConnectionLockObserved: true,
      firstTransaction: rollbackFirst ? 'rolled_back' : 'committed',
      firstOutcome: result1.status, secondOutcome: result2.value.status,
      finalPlan: final.plan, remainingSeconds: final.realtime_seconds_remaining ?? 0,
      checkoutReceipts: final.checkout_receipts, subscriptionReceipts: final.subscription_receipts,
      revocations: final.revocations });
  } finally {
    await first.query('rollback').catch(() => {});
    await second.query('rollback').catch(() => {});
  }
}

try {
  await Promise.all([admin.connect(), first.connect(), second.connect()]);
  const definitions = (await admin.query(`select n.nspname schema,p.proname name,
    pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','billing_private')
      and p.proname in ('fulfill_checkout','apply_subscription_billing_event','revoke_billing_purchase')
    order by n.nspname,p.proname`)).rows;
  assert.equal(definitions.length, 5, 'Expected three public wrappers and two private implementations');
  // Guard against a schema default that could increment a real production
  // sequence or invoke a project function from a synthetic fixture insert.
  const riskyDefaults = (await admin.query(`select c.relname,a.attname,pg_get_expr(d.adbin,d.adrelid) expression
    from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum
    where n.nspname='public' and c.relname=any($1::text[])`, [tables])).rows
    .filter(row => /nextval|public\.|auth\./i.test(row.expression));
  assert.equal(riskyDefaults.length, 0, 'Unsafe production-referencing fixture defaults; inspect before proceeding');
  await admin.query('begin');
  await admin.query(`create schema ${quote(fixture)}; create schema ${quote(internal)}`);
  created = true;
  for (const table of tables) {
    await admin.query(`create table ${fixture}.${table} (like public.${table} including defaults including constraints including indexes)`);
  }
  await admin.query(`create table ${fixture}.activity_events(billing_event_id text)`);
  await admin.query(`insert into ${fixture}.billing_checkout_policy select * from public.billing_checkout_policy`);
  for (const def of definitions) await admin.query(cloned(def.definition));
  await admin.query(`revoke all on schema ${fixture},${internal} from public,anon,authenticated;
    grant usage on schema ${fixture},${internal} to service_role;
    grant select,insert,update,delete on all tables in schema ${fixture} to service_role;
    revoke all on all functions in schema ${fixture},${internal} from public,anon,authenticated;
    grant execute on all functions in schema ${fixture},${internal} to service_role`);
  const leakChecks = (await admin.query(`select
    (select count(*) from pg_constraint where connamespace in (select oid from pg_namespace where nspname=any($1::text[])) and contype='f')::int foreign_keys,
    (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1::text[]) and not t.tgisinternal)::int application_triggers`, [[fixture, internal]])).rows[0];
  assert.deepEqual(leakChecks, { foreign_keys: 0, application_triggers: 0 });
  const copied = (await admin.query(`select n.nspname schema,p.proname name,pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=any($1::text[])`, [[fixture, internal]])).rows;
  for (const def of definitions) {
    const match = copied.find(row => row.name === def.name && row.schema === (def.schema === 'public' ? fixture : internal));
    assert.equal(normalize(match?.definition || ''), def.definition, 'Installed function clone parity failed');
  }
  report.functionParity = { count: definitions.length, normalizedDefinitionsEqual: true,
    installedDefinitionsSha256: createHash('sha256').update(definitions.map(x => x.definition).join('\n')).digest('hex') };
  report.fixtureIsolation = leakChecks;
  await admin.query('commit');
  const now = new Date((await admin.query('select now() timestamp')).rows[0].timestamp);
  const at = seconds => new Date(now.getTime() + seconds * 1000).toISOString();
  const pass = { plan: 'premium', plan_status: 'active', plan_sku: 'exam_pass' };
  const paid = (id, invoice) => ({ plan: 'premium', plan_status: 'active', plan_sku: 'monthly',
    stripe_subscription_id: id, premium_since: at(0), plan_started_at: at(0), _invoice_id: invoice,
    _paid_purchase: true, _purchase_requires_refill: true });
  {
    const user = await createUser();
    await race('duplicate activation preserves interleaved consumed quota', user,
      c => grant(c, user, 'cs_qa_duplicate', pass, at(0)), c => grant(c, user, 'cs_qa_duplicate', pass, at(0)),
      (s, a, b) => { assert.equal(a.status, 'applied'); assert.equal(b.status, 'already_applied'); assert.equal(s.checkout_receipts, 1); assert.equal(s.realtime_seconds_remaining, 321); },
      { afterFirst: c => c.query(`update ${fixture}.user_quotas set realtime_seconds_remaining=321 where user_id=$1`, [user]) });
  }
  {
    const user = await createUser();
    await race('activation rollback lets waiting retry grant once', user,
      c => grant(c, user, 'cs_qa_rollback', pass, at(0)), c => grant(c, user, 'cs_qa_rollback', pass, at(0)),
      (s, a, b) => { assert.equal(b.status, 'applied'); assert.equal(s.checkout_receipts, 1); assert.equal(s.realtime_seconds_remaining, 3600); }, { rollbackFirst: true });
  }
  for (const refundFirst of [false, true]) {
    const user = await createUser(); const session = `cs_qa_refund_${refundFirst}`;
    const activation = c => grant(c, user, session, pass, at(0));
    const reversal = c => revoke(c, user, `checkout:${session}`);
    await race(`activation versus same purchase refund, refundFirst=${refundFirst}`, user,
      refundFirst ? reversal : activation, refundFirst ? activation : reversal,
      s => { assert.equal(s.plan, 'free'); assert.equal(s.realtime_seconds_remaining ?? 0, 0); assert.equal(s.revocations, 1); });
  }
  {
    const user = await createUser(); const fields = paid('sub_qa_duplicate_renewal', 'in_qa_initial_duplicate');
    await grant(admin, user, 'cs_qa_initial_duplicate', fields, at(0));
    fields._invoice_id = 'in_qa_cycle_duplicate';
    const renew = c => subscription(c, user, 'invoice:in_qa_cycle_duplicate', fields, at(30), at(30), 3600);
    await race('duplicate renewal preserves interleaved consumed quota', user, renew, renew,
      (s, a, b) => { assert.equal(b.status, 'already_applied'); assert.equal(s.subscription_receipts, 1); assert.equal(s.realtime_seconds_remaining, 222); assert.equal(s.purchase_key, 'invoice:in_qa_cycle_duplicate'); },
      { afterFirst: c => c.query(`update ${fixture}.user_quotas set realtime_seconds_remaining=222 where user_id=$1`, [user]) });
  }
  for (const refundFirst of [false, true]) {
    const user = await createUser(); const sub = `sub_qa_old_refund_${refundFirst}`; const initial = `in_qa_old_${refundFirst}`; const next = `in_qa_new_${refundFirst}`;
    const fields = paid(sub, initial); await grant(admin, user, `cs_qa_old_refund_${refundFirst}`, fields, at(0)); fields._invoice_id = next;
    const renewal = c => subscription(c, user, `invoice:${next}`, fields, at(30), at(30), 3600);
    const reversal = c => revoke(c, user, `invoice:${initial}`, sub, `invoice:${initial}`);
    await race(`new renewal versus prior purchase refund, refundFirst=${refundFirst}`, user,
      refundFirst ? reversal : renewal, refundFirst ? renewal : reversal,
      s => { assert.equal(s.plan, 'premium'); assert.equal(s.purchase_key, `invoice:${next}`); assert.equal(s.realtime_seconds_remaining, 3600); });
  }
  for (const refundFirst of [false, true]) {
    const user = await createUser(); const sub = `sub_qa_same_refund_${refundFirst}`; const initial = `in_qa_previous_${refundFirst}`; const next = `in_qa_reversed_cycle_${refundFirst}`;
    const fields = paid(sub, initial); await grant(admin, user, `cs_qa_same_refund_${refundFirst}`, fields, at(0)); fields._invoice_id = next;
    const renewal = c => subscription(c, user, `invoice:${next}`, fields, at(30), at(30), 3600);
    const reversal = c => revoke(c, user, `invoice:${next}`, sub, `invoice:${next}`);
    await race(`renewal versus same invoice refund, refundFirst=${refundFirst}`, user,
      refundFirst ? reversal : renewal, refundFirst ? renewal : reversal,
      s => {
        assert.equal(s.revocations, 1);
        if (refundFirst) { assert.equal(s.purchase_key, `invoice:${initial}`); assert.equal(s.plan, 'premium'); assert.equal(s.realtime_seconds_remaining, 3600); assert.equal(s.subscription_receipts, 0); }
        else { assert.equal(s.plan, 'free'); assert.equal(s.realtime_seconds_remaining, 0); }
      });
  }
  for (const deleteFirst of [false, true]) {
    const user = await createUser(); const old = paid(`sub_qa_deleted_${deleteFirst}`, `in_qa_deleted_${deleteFirst}`);
    await grant(admin, user, `cs_qa_deleted_initial_${deleteFirst}`, old, at(0));
    const next = { ...paid(`sub_qa_replacement_${deleteFirst}`, `in_qa_replacement_${deleteFirst}`), premium_since: at(30), plan_started_at: at(30) };
    const activation = c => grant(c, user, `cs_qa_replacement_${deleteFirst}`, next, at(30));
    const deletion = c => subscription(c, user, `evt_qa_deletion_${deleteFirst}`, { ...old, plan: 'free', plan_status: 'canceled' }, at(60), null, 0);
    await race(`new subscription versus old deletion, deleteFirst=${deleteFirst}`, user,
      deleteFirst ? deletion : activation, deleteFirst ? activation : deletion,
      s => { assert.equal(s.plan, 'premium'); assert.equal(s.stripe_subscription_id, next.stripe_subscription_id); assert.equal(s.realtime_seconds_remaining, 3600); });
  }
  report.allPassed = true;
} catch (error) {
  failure = error;
  report.allPassed = false;
  report.failure = { message: error.message, code: error.code || null };
} finally {
  await Promise.allSettled([first.query('rollback'), second.query('rollback'), admin.query('rollback')]);
  if (created) {
    // These identifiers were generated by this invocation and validated above.
    await admin.query(`drop schema if exists ${quote(fixture)} cascade; drop schema if exists ${quote(internal)} cascade`);
  }
  const cleanup = await admin.query('select count(*)::int remaining from pg_namespace where nspname=any($1::text[])', [[fixture, internal]]).catch(() => null);
  report.cleanupVerified = cleanup?.rows[0]?.remaining === 0;
  report.limits = 'Cloned installed function logic has exact normalized parity; unrelated auth/profile triggers, foreign keys and production RLS policies are excluded. Tests use fixed synthetic provider facts, not live Stripe events/network delivery.';
  fs.mkdirSync(path.join(root, 'docs/analytics-investigation-2026-09-06'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/analytics-investigation-2026-09-06/billing-concurrency-qa.json'), JSON.stringify(report, null, 2));
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
console.log(JSON.stringify(report, null, 2));
if (failure || !report.cleanupVerified) process.exitCode = 1;
