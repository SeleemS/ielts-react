// Read-only operational funnel report. Run with --read-only; no Stripe writes.
// Optional --end=YYYY-MM-DD (exclusive UTC date), --exclusions=/private/file.json
// (array of user UUIDs), --output=/path/report.json. Never outputs user/session IDs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Stripe from 'stripe';
import { summarizeFunnel, observedOfferPath } from './funnel-report-core.mjs';
if (!process.argv.includes('--read-only')) throw new Error('--read-only required');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = name => process.argv.find(s => s.startsWith(`--${name}=`))?.slice(name.length + 3);
const env = { ...process.env };
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const endDate = option('end') || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(Date.parse(endDate))) throw new Error('Invalid exclusive UTC end date');
const end = `${endDate}T00:00:00.000Z`;
const start = new Date(Date.parse(end) - 28 * 86400000).toISOString();
const exclusions = new Set(JSON.parse(option('exclusions') ? fs.readFileSync(option('exclusions'), 'utf8') : env.FUNNEL_QA_USER_IDS_JSON || '[]'));
// The approved audit account never enters reported business results.
for (const qaFile of ['/private/tmp/ielts-confirmed-qa.json', '/private/tmp/ielts-exampass-qa.json']) {
  if (fs.existsSync(qaFile)) exclusions.add(JSON.parse(fs.readFileSync(qaFile, 'utf8')).userId);
}
for (const id of exclusions) if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Exclusions must contain user UUIDs');
const db = new pg.Client({ connectionString: env.SUPABASE_DB_SESSION_URL || env.SUPABASE_DB_URL });
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20000 });
const report = { generatedAt: new Date().toISOString(), exclusiveEndUtc: end,
  exclusionPolicy: { explicitUserIds: exclusions.size, completeness: 'Operator-maintained exclusions; unknown internal accounts may remain.' },
  method: 'Operational practice + atomic checkout activation reconciled to live Stripe sessions; separate consent-limited offer reach. No content fields read.' };
async function listAll(resource, params) {
  const result = [];
  for await (const item of resource.list({ ...params, limit: 100 })) {
    result.push(item);
    if (result.length >= 10000) throw new Error('Provider pagination safety cap reached; report refused rather than truncated');
  }
  return result;
}
try {
  await db.connect();
  await db.query('begin read only');
  await db.query("set local statement_timeout='30s'");
  const users = (await db.query(`select id,stripe_customer_id from public.users where not is_anonymous and email is not null and created_at<$1`, [end])).rows;
  const practice = (await db.query(`select user_id,submitted_at completed_at,skill::text kind from public.attempts
    where submitted_at >= $1 and submitted_at < $2 and skill in ('reading','listening')
    union all select s.user_id,s.created_at completed_at,
      case when a.responses->>'source'='band-estimator' then 'estimator_ai_score' else 'ai_score' end kind
    from public.scores s join public.attempts a on a.id=s.attempt_id
    where s.created_at >= $1 and s.created_at < $2`, [start,end])).rows;
  const fulfillments = (await db.query(`select session_id,user_id,fulfilled_at,access_expires_at,outcome from public.billing_checkout_fulfillments `, [])).rows;
  const revocations = (await db.query(`select purchase_key,revoked_at from public.billing_purchase_revocations where revoked_at<$1`,[end])).rows;
  const offerEvents = (await db.query(`select user_id,event,created_at from public.activity_events where created_at >= $1 and created_at<$2 and event in ('exam_pass_offer_view','exam_pass_offer_click') and props->>'offer_version'='exam_pass_v1' and user_id<>all($3::uuid[])`,[start,end,[...exclusions]])).rows;
  report.consentLimitedEvents = (await db.query(`select event,count(*)::int events,count(distinct coalesce(user_id::text,anon_id))::int recorded_identities
    from public.activity_events where created_at >= $1 and created_at<$2
      and event in ('exam_pass_offer_view','exam_pass_offer_click')
      and coalesce(user_id::text,'')<>all($3::text[]) group by event order by event`, [start,end,[...exclusions]])).rows;
  report.operationalDiagnostics = (await db.query(`select event,props->>'stage' stage,count(*)::int records
    from public.activity_events where created_at >= $1 and created_at<$2 and props->>'source'='billing_checkout'
      and user_id<>all($3::uuid[]) group by event,props->>'stage' order by event,stage`,[start,end,[...exclusions]])).rows;
  await db.query('rollback');
  const rawSessions = await listAll(stripe.checkout.sessions, { created: { lt: Date.parse(end)/1000 } });
  // Strip provider contact/address/payment details before aggregation.
  const sessions = rawSessions.map(s => ({ id:s.id,created:s.created,livemode:s.livemode,status:s.status,
    payment_status:s.payment_status,amount_total:s.amount_total,currency:s.currency,mode:s.mode,
    client_reference_id:s.client_reference_id,metadata:{user_id:s.metadata?.user_id,sku:s.metadata?.sku},
    payment_intent:typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent?.id,
    invoice:typeof s.invoice==='string'?s.invoice:s.invoice?.id }));
  // Revocation bounds completed practice; it does not rewrite gross revenue.
  for(const f of fulfillments) {
    const session=sessions.find(s=>s.id===f.session_id);
    const key=session?.mode==='payment'?`checkout:${f.session_id}`:`invoice:${session?.invoice}`;
    const revoked=revocations.find(r=>r.purchase_key===key);
    if(revoked && (!f.access_expires_at || Date.parse(revoked.revoked_at)<Date.parse(f.access_expires_at))) f.access_expires_at=revoked.revoked_at;
  }
  // Paid invoice history identifies existing recurring/direct-billed customers,
  // excluding invoices belonging to the Checkout activations already modeled.
  const invoices = await listAll(stripe.invoices, { status: 'paid', created: { lt: Date.parse(end)/1000 } });
  const priorPayments = invoices.filter(i => i.livemode && i.amount_paid > 0 && !sessions.some(s => s.invoice === i.id))
    .map(i => ({ user_id: users.find(u => u.stripe_customer_id === (typeof i.customer === 'string' ? i.customer : i.customer?.id))?.id,
      paid_at: new Date((i.status_transitions?.paid_at || i.created) * 1000).toISOString() })).filter(p => p.user_id);
  report.windows = [14,28].map(days => summarizeFunnel({users,practice,fulfillments,sessions,priorPayments,exclusions:[...exclusions],end,days}));
  report.observedSignedInOfferPath = [14,28].map(days => observedOfferPath({events:offerEvents,practice,sessions,fulfillments,exclusions:[...exclusions],end,days}));
  const charges = await listAll(stripe.charges,{created:{gte:Date.parse(start)/1000,lt:Date.parse(end)/1000}});
  const known=new Set(users.map(u=>u.id));
  const eligibleSessions=sessions.filter(s=>known.has(s.client_reference_id||s.metadata.user_id)&&!exclusions.has(s.client_reference_id||s.metadata.user_id));
  const matched=charges.filter(c=>eligibleSessions.some(s=>(s.payment_intent&&s.payment_intent===c.payment_intent)||(s.invoice&&s.invoice===c.invoice)));
  report.refundReconciliation = { matchedCheckoutCharges:matched.length,
    refundedMatchedCheckoutCharges:matched.filter(c=>c.amount_refunded>0).length,
    disputedMatchedCheckoutCharges:matched.filter(c=>c.disputed).length,
    note:'Gross revenue is not net revenue. Charges lacking exact Checkout payment_intent/invoice linkage are not attributed; renewals are excluded. Refunds of older charges require a dedicated ledger reconciliation.' };
  report.limits = [
    'Complete UTC windows, not randomized cohorts or an A/B test. No causal lift claim.',
    'Eligible learner means current non-anonymous account with completed persisted practice in window before first recorded paid Checkout; this is not all visitors or verified offer exposure.',
    'Revenue is gross collected positive-value first Checkout activations among that eligible cohort, grouped by currency. Excludes zero orders, explicit QA, repeat purchases and recurring invoice renewals. No currency conversion.',
    'Paid activation requires Stripe complete/paid plus applied fulfillment receipt. Missing historical receipts are reported; pre-cutover activation is not reconstructed.',
    'Completed AI score is reported separately from free Reading/Listening. Estimator mirrors count as prior AI-result exposure but not as paid AI-score outcomes. AI scoring after activation infers active entitlement, not direct quota consumption.',
    'First completed practice is within fourteen days after activation, bounded by recorded pass expiry/revocation; only cohorts with fourteen complete follow-up days enter that rate. It is not proof of paid quota consumption.',
    'Current verified-account status can differ from account status at historical practice. Paid invoice history excludes known prior recurring/direct-billed customers; off-Stripe/manual payments and unknown internal accounts can still limit first-customer classification.',
    'Offer exposure/click events are consent-limited and not joined into an invented complete funnel. Operational billing diagnostics begin at their deployment; earlier zero does not prove no failures.',
  ];
  const output=option('output');
  if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { await db.query('rollback').catch(()=>{});await db.end(); }
