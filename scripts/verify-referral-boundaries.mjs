// Real separate-connection race verification in isolated, empty QA schemas.
// Reads installed function definitions/schema metadata, never customer rows.
// Usage: node scripts/verify-referral-boundaries.mjs --run-isolated
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
const fixture = `qa_ref_${randomUUID().replaceAll('-', '')}`;
assert(/^qa_ref_[a-f0-9]{32}$/.test(fixture));
const admin = new pg.Client({ connectionString });
const first = new pg.Client({ connectionString });
const second = new pg.Client({ connectionString });
const report = { testedAt: new Date().toISOString(), customerRowsReadOrChanged: 0, checks: [], findings: [] };
let created=false;
let failure;
async function user(age=0, anonymous=false) {
  const id=randomUUID();
  await admin.query(`insert into ${fixture}.users(id,created_at,is_anonymous) values($1,now()-$2*interval '1 day',$3)`,[id,age,anonymous]);
  return id;
}
async function redeem(c,code,id) {
  return (await c.query(`select ${fixture}.redeem_referral($1,$2) result`,[code,id])).rows[0].result;
}
async function bonus(id) {
  return (await admin.query(`select referral_bonus_scores n from ${fixture}.user_quotas where user_id=$1`,[id])).rows[0]?.n || 0;
}
async function check(name,action) { await action();report.checks.push({name,passed:true}); }
try {
  await Promise.all([admin.connect(),first.connect(),second.connect()]);
  const defs=(await admin.query(`select pg_get_functiondef('public.redeem_referral(text,uuid)'::regprocedure) definition`)).rows;
  const definition=defs[0].definition;
  const tables=['users','user_quotas','referral_codes','referrals'];
  const defaults=(await admin.query(`select pg_get_expr(d.adbin,d.adrelid) expression from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[])`,[tables])).rows;
  assert.equal(defaults.filter(d=>/nextval|public\.|auth\./i.test(d.expression)).length,0);
  await admin.query('begin');
  await admin.query(`create schema ${fixture}`);created=true;
  for(const table of tables) await admin.query(`create table ${fixture}.${table} (like public.${table} including defaults including constraints including indexes)`);
  await admin.query(definition.replaceAll('public.',`${fixture}.`));
  await admin.query(`revoke all on schema ${fixture} from public,anon,authenticated; grant usage on schema ${fixture} to service_role;
    revoke all on all functions in schema ${fixture} from public,anon,authenticated; grant execute on all functions in schema ${fixture} to service_role`);
  const copy=(await admin.query(`select pg_get_functiondef($1::regprocedure) definition`,[`${fixture}.redeem_referral(text,uuid)`])).rows[0].definition;
  assert.equal(copy.replaceAll(`${fixture}.`,'public.'),definition);
  report.functionParity={normalizedDefinitionsEqual:true,installedDefinitionSha256:createHash('sha256').update(definition).digest('hex')};
  const leaks=(await admin.query(`select (select count(*)::int from pg_constraint where connamespace=(select oid from pg_namespace where nspname=$1) and contype='f') foreign_keys,
    (select count(*)::int from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and not t.tgisinternal) application_triggers`,[fixture])).rows[0];
  assert.deepEqual(leaks,{foreign_keys:0,application_triggers:0});report.fixtureIsolation=leaks;
  await admin.query('commit');
  for(const c of [first,second]) {
    await c.query('set role service_role');
    await c.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
    await c.query("set lock_timeout='5s'; set statement_timeout='10s'");
  }
  const ref=await user();const target=await user();const code='qaref001';
  await admin.query(`insert into ${fixture}.referral_codes(user_id,code) values($1,$2)`,[ref,code]);
  await check('unknown code',async()=>assert.equal((await redeem(first,'unknown1',target)).reason,'invalid_code'));
  await check('self referral',async()=>assert.equal((await redeem(first,code,ref)).reason,'self_referral'));
  await check('unknown user',async()=>assert.equal((await redeem(first,code,randomUUID())).reason,'unknown_user'));
  await check('stale account',async()=>assert.equal((await redeem(first,code,await user(8))).reason,'account_too_old'));
  await check('anonymous account',async()=>assert.equal((await redeem(first,code,await user(0,true))).reason,'account_required'));
  await check('valid award once',async()=>{assert.equal((await redeem(first,code,target)).credited,true);assert.equal(await bonus(ref),1);assert.equal(await bonus(target),1);});
  await check('repeat cannot award again',async()=>{assert.equal((await redeem(first,code,target)).reason,'already_redeemed');assert.equal(await bonus(ref),1);assert.equal(await bonus(target),1);});
  const rollbackTarget=await user();
  await check('transaction rollback reverses both awards and receipt',async()=>{
    await first.query('begin');assert.equal((await redeem(first,code,rollbackTarget)).credited,true);await first.query('rollback');
    assert.equal(await bonus(ref),1);assert.equal(await bonus(rollbackTarget),0);
    assert.equal((await admin.query(`select count(*)::int n from ${fixture}.referrals where referred_user_id=$1`,[rollbackTarget])).rows[0].n,0);
  });
  await check('rolled-back redemption retries once',async()=>{assert.equal((await redeem(first,code,rollbackTarget)).credited,true);assert.equal(await bonus(rollbackTarget),1);assert.equal((await redeem(first,code,rollbackTarget)).reason,'already_redeemed');});
  for(let i=0;i<3;i++) assert.equal((await redeem(first,code,await user())).credited,true);
  await check('monthly fifth award caps sixth attribution',async()=>{
    const sixth=await user();assert.equal((await redeem(first,code,sixth)).reason,'referrer_monthly_cap');assert.equal(await bonus(ref),5);assert.equal(await bonus(sixth),0);
    assert.equal((await redeem(first,code,sixth)).reason,'already_redeemed');
  });
  const raceRef=await user();const raceCode='qaref002';
  await admin.query(`insert into ${fixture}.referral_codes(user_id,code) values($1,$2)`,[raceRef,raceCode]);
  for(let i=0;i<4;i++) await redeem(first,raceCode,await user());
  const a=await user(),b=await user();
  await first.query('begin');await second.query('begin');
  const firstPid=(await first.query('select pg_backend_pid() pid')).rows[0].pid;
  const secondPid=(await second.query('select pg_backend_pid() pid')).rows[0].pid;
  assert.notEqual(firstPid,secondPid);
  const resultA=await redeem(first,raceCode,a);
  let settled=false;
  const pending=redeem(second,raceCode,b).then(value=>{settled=true;return {value};},error=>{settled=true;return {error};});
  let blocked=false;
  for(let i=0;i<30&&!settled;i++) {
    blocked=(await admin.query('select $1::int=any(pg_blocking_pids($2::int)) blocked',[firstPid,secondPid])).rows[0].blocked;
    if(blocked)break;
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  assert.equal(blocked,true);
  await first.query('commit');const resultB=await pending;if(resultB.error)throw resultB.error;await second.query('commit');
  const finalBonus=await bonus(raceRef);
  report.concurrentCap={separateConnectionLockObserved:true,firstCredited:resultA.credited,secondCredited:resultB.value.credited,finalBonus,expectedMaximum:5};
  assert.equal(resultA.credited,true);
  assert.equal(resultB.value.credited,false);
  assert.equal(resultB.value.reason,'referrer_monthly_cap');
  assert.equal(finalBonus,5);
  assert.equal(await bonus(a),1);
  assert.equal(await bonus(b),0);
  const attribution=(await admin.query(`select credited_at from ${fixture}.referrals where referred_user_id=$1`,[b])).rows;
  assert.equal(attribution.length,1);assert.equal(attribution[0].credited_at,null);
  report.checks.push({name:'concurrent fifth credit awards only winner and retains loser attribution',passed:true});
  report.allBoundaryChecksPassed=true;
} catch(error) { failure=error;report.failure={message:error.message,code:error.code||null}; }
finally {
  await Promise.allSettled([first.query('rollback'),second.query('rollback'),admin.query('rollback')]);
  if(created)await admin.query(`drop schema if exists ${fixture} cascade`);
  const clean=await admin.query('select count(*)::int n from pg_namespace where nspname=$1',[fixture]).catch(()=>null);
  report.cleanupVerified=clean?.rows[0]?.n===0;
  report.limits='Exact installed SECURITY DEFINER logic with service-role JWT context; only isolated synthetic rows. Auth/profile triggers, foreign keys and production RLS excluded. No actual referral or customer quota writes.';
  fs.mkdirSync(path.join(root, 'docs/analytics-investigation-2026-09-06'), { recursive: true });
  fs.writeFileSync(path.join(root,'docs/analytics-investigation-2026-09-06/referral-boundaries-qa.json'),JSON.stringify(report,null,2));
  await Promise.allSettled([admin.end(),first.end(),second.end()]);
}
console.log(JSON.stringify(report,null,2));
if(failure||!report.cleanupVerified)process.exitCode=1;
