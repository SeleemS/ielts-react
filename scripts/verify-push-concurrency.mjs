// Real separate-connection race verification in isolated, empty QA schemas.
// Reads installed function definitions/schema metadata, never customer rows.
// Usage: node scripts/verify-push-concurrency.mjs --run-isolated
// Credentials are loaded locally and never printed. Exact generated schemas
// are removed in finally; no production subscription row is read or changed.
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
const fixture = `qa_push_${randomUUID().replaceAll('-', '')}`;
assert(/^qa_push_[a-f0-9]{32}$/.test(fixture));
const admin = new pg.Client({ connectionString });
const first = new pg.Client({ connectionString });
const second = new pg.Client({ connectionString });
const report = { testedAt: new Date().toISOString(), customerRowsReadOrChanged: 0,
  providerRequests: 0, races: [], method: 'Separate PostgreSQL connections; service_role; exact installed function clones' };
let created = false;
let failure;
const at = minutes => new Date(Date.parse('2026-09-06T19:00:00Z') + minutes * 60000).toISOString();
async function claim(c, id, minute = 0) {
  return (await c.query(`select ${fixture}.claim_push_reminder($1,$2) result`, [id, at(minute)])).rows[0].result;
}
async function finish(c, id, token, minute = 0) {
  return (await c.query(`select ${fixture}.finish_push_reminder($1,$2,true,false,false,$3) result`, [id, token, at(minute)])).rows[0].result;
}
async function row() {
  const id = randomUUID();
  await admin.query(`insert into ${fixture}.push_subscriptions(id,user_id,endpoint,keys,time_zone,reminder_hour_local)
    values($1,$2,$3,'{}','UTC',19)`, [id, randomUUID(), `https://fcm.googleapis.com/wp/synthetic-${id}`]);
  return id;
}
async function race(name, op1, op2, verify) {
  for (const c of [first, second]) {
    await c.query('begin');
    await c.query("set local lock_timeout='5s'; set local statement_timeout='10s'; set local role service_role");
  }
  try {
    const pid1 = (await first.query('select pg_backend_pid() pid')).rows[0].pid;
    const pid2 = (await second.query('select pg_backend_pid() pid')).rows[0].pid;
    assert.notEqual(pid1, pid2);
    const a = await op1(first);
    let settled = false;
    const pending = op2(second).then(value => { settled = true; return { value }; }, error => { settled = true; return { error }; });
    let blocked = false;
    for (let i = 0; i < 30 && !settled; i++) {
      blocked = (await admin.query('select $1::int=any(pg_blocking_pids($2::int)) blocked', [pid1, pid2])).rows[0].blocked;
      if (blocked) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.equal(blocked, true, `${name}: expected actual lock contention`);
    await first.query('commit');
    const b = await pending;
    if (b.error) throw b.error;
    await second.query('commit');
    await verify(a, b.value);
    report.races.push({ name, passed: true, separateConnectionLockObserved: true });
  } finally {
    await Promise.allSettled([first.query('rollback'), second.query('rollback')]);
  }
}
try {
  await Promise.all([admin.connect(), first.connect(), second.connect()]);
  const defs = (await admin.query(`select p.proname name, pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('claim_push_reminder','finish_push_reminder') order by p.proname`)).rows;
  assert.equal(defs.length, 2);
  const defaults = (await admin.query(`select pg_get_expr(d.adbin,d.adrelid) expression from pg_attrdef d
    join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='push_subscriptions'`)).rows;
  assert.equal(defaults.filter(d => /nextval|public\.|auth\./i.test(d.expression)).length, 0);
  await admin.query('begin');
  await admin.query(`create schema ${fixture}`);
  created = true;
  await admin.query(`create table ${fixture}.push_subscriptions
    (like public.push_subscriptions including defaults including constraints including indexes)`);
  for (const d of defs) await admin.query(d.definition.replaceAll('public.', `${fixture}.`));
  await admin.query(`revoke all on schema ${fixture} from public,anon,authenticated;
    grant usage on schema ${fixture} to service_role;
    grant select,insert,update,delete on all tables in schema ${fixture} to service_role;
    revoke all on all functions in schema ${fixture} from public,anon,authenticated;
    grant execute on all functions in schema ${fixture} to service_role`);
  const copies = (await admin.query(`select p.proname name,pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1`, [fixture])).rows;
  for (const d of defs) assert.equal(copies.find(c => c.name === d.name).definition.replaceAll(`${fixture}.`, 'public.'), d.definition);
  report.functionParity = { count: 2, normalizedDefinitionsEqual: true,
    installedDefinitionsSha256: createHash('sha256').update(defs.map(d => d.definition).join('\n')).digest('hex') };
  const isolation = (await admin.query(`select
    (select count(*)::int from pg_constraint where connamespace=(select oid from pg_namespace where nspname=$1) and contype='f') foreign_keys,
    (select count(*)::int from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and not t.tgisinternal) application_triggers`, [fixture])).rows[0];
  assert.deepEqual(isolation, { foreign_keys: 0, application_triggers: 0 });
  report.fixtureIsolation = isolation;
  await admin.query('commit');
  {
    const id = await row();
    await race('concurrent claims grant one lease', c => claim(c,id), c => claim(c,id),
      (a,b) => { assert.equal(a.claimed,true); assert.equal(b.claimed,false); });
  }
  {
    const id = await row();
    const old = await claim(admin,id);
    await race('reclaim rejects waiting stale-token completion', c => claim(c,id,11), c => finish(c,id,old.token,11),
      async (a,b) => {
        assert.equal(a.claimed,true); assert.equal(b,false);
        const s = (await admin.query(`select delivery_claim_token,last_sent_at from ${fixture}.push_subscriptions where id=$1`,[id])).rows[0];
        assert.equal(s.delivery_claim_token,a.token); assert.equal(s.last_sent_at,null);
      });
  }
  for (const disableFirst of [true,false]) {
    const id = await row(); const lease = await claim(admin,id);
    const disable = c => c.query(`update ${fixture}.push_subscriptions set enabled=false,disabled_reason='user-disabled' where id=$1`,[id]);
    const done = c => finish(c,id,lease.token);
    await race(`completion preserves user disable, disableFirst=${disableFirst}`,
      disableFirst ? disable : done, disableFirst ? done : disable,
      async () => {
        const s = (await admin.query(`select enabled,disabled_reason,delivery_claim_token,last_sent_at from ${fixture}.push_subscriptions where id=$1`,[id])).rows[0];
        assert.equal(s.enabled,false); assert.equal(s.disabled_reason,'user-disabled');
        assert.equal(s.delivery_claim_token,null); assert.equal(s.last_sent_at.toISOString(),at(0));
      });
  }
  report.allPassed = true;
} catch (error) {
  failure = error;
  report.allPassed = false;
  report.failure = { message: error.message, code: error.code || null };
} finally {
  await Promise.allSettled([first.query('rollback'),second.query('rollback'),admin.query('rollback')]);
  if (created) await admin.query(`drop schema if exists ${fixture} cascade`);
  const cleanup = await admin.query('select count(*)::int remaining from pg_namespace where nspname=$1',[fixture]).catch(() => null);
  report.cleanupVerified = cleanup?.rows[0]?.remaining === 0;
  report.limits = 'Exact installed function logic; isolated table constraints/indexes/defaults. Production RLS, auth foreign keys and application triggers excluded. No push-provider delivery; provider acceptance followed by process crash is not exactly-once.';
  fs.mkdirSync(path.join(root, 'docs/analytics-investigation-2026-09-06'), { recursive: true });
  fs.writeFileSync(path.join(root,'docs/analytics-investigation-2026-09-06/push-concurrency-qa.json'),JSON.stringify(report,null,2));
  await Promise.allSettled([admin.end(),first.end(),second.end()]);
}
console.log(JSON.stringify(report,null,2));
if (failure || !report.cleanupVerified) process.exitCode=1;
