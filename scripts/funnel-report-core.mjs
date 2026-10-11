// Pure aggregation over minimal operational facts. No essays/audio or analytics IDs.
export function summarizeFunnel({ users, practice, fulfillments, sessions, priorPayments = [], exclusions = [], end, days }) {
  const endMs = Date.parse(end);
  const startMs = endMs - days * 86400000;
  const excluded = new Set(exclusions);
  const known = new Set(users.filter(u => !excluded.has(u.id)).map(u => u.id));
  const identity = s => s.client_reference_id || s.metadata?.user_id || null;
  const validPaid = sessions.filter(s => s.livemode && s.status === 'complete' && s.payment_status === 'paid' && s.amount_total > 0 && ['payment', 'subscription'].includes(s.mode));
  const firstPaid = new Map();
  for (const p of priorPayments) firstPaid.set(p.user_id, Math.min(firstPaid.get(p.user_id) ?? Infinity, Date.parse(p.paid_at)));
  for (const s of validPaid) {
    const u = identity(s);
    // Payment time is not Checkout Session creation time. The atomic activation
    // receipt is the operational completion boundary; historical missing rows
    // remain explicitly unmapped rather than silently backdated.
    const f = fulfillments.find(f => f.session_id === s.id && f.outcome === 'applied');
    const time = f ? Date.parse(f.fulfilled_at) : s.created * 1000;
    if (u && (!firstPaid.has(u) || firstPaid.get(u) > time)) firstPaid.set(u, time);
  }
  const eligible = new Map();
  for (const p of practice) {
    const t = Date.parse(p.completed_at);
    if (!known.has(p.user_id) || t < startMs || t >= endMs) continue;
    // Denominator: authenticated learners completing practice before their
    // first paid purchase, not all visitors or a fabricated offer exposure.
    if (firstPaid.has(p.user_id) && firstPaid.get(p.user_id) <= t) continue;
    eligible.set(p.user_id, Math.min(eligible.get(p.user_id) ?? Infinity, t));
  }
  const totals = { windowDays: days, start: new Date(startMs).toISOString(), end,
    eligiblePractisingLearners: eligible.size, createdSessions: 0, paidActivations: 0,
    newPayingLearners: 0, returningPurchaseActivations: 0, zeroValueActivationsExcluded: 0,
    paidSessionsMissingActivation: 0, firstCompletedPracticeWithin14Days: 0, firstCompletedAiScoreWithin14Days: 0, matureActivatedLearners: 0,
    eligibleNewPayingLearners: 0, eligiblePurchaseRate: null, firstPracticeRate: null, firstAiScoreRate: null,
    revenueByCurrency: { usd: { grossCollectedMinor: 0, perEligibleLearnerMinor: null } } };
  const purchasers = new Set();
  for (const s of sessions) {
    const u = identity(s);
    if (!known.has(u) || !s.livemode) continue;
    if (s.created * 1000 >= startMs && s.created * 1000 < endMs) totals.createdSessions++;
    const f = fulfillments.find(f => f.session_id === s.id && f.outcome === 'applied');
    if (!f) {
      if (validPaid.includes(s) && s.created * 1000 >= startMs && s.created * 1000 < endMs) totals.paidSessionsMissingActivation++;
      continue;
    }
    const activated = Date.parse(f.fulfilled_at);
    if (activated < startMs || activated >= endMs) continue;
    if (!s.amount_total) { totals.zeroValueActivationsExcluded++; continue; }
    if (!validPaid.includes(s)) continue;
    totals.paidActivations++;
    const isFirst = firstPaid.get(u) === activated;
    if (isFirst) purchasers.add(u); else totals.returningPurchaseActivations++;
    if (!eligible.has(u) || eligible.get(u) > activated || !isFirst) continue;
    totals.eligibleNewPayingLearners++;
    const currency = s.currency || 'unknown';
    totals.revenueByCurrency[currency] ??= { grossCollectedMinor: 0, perEligibleLearnerMinor: null };
    totals.revenueByCurrency[currency].grossCollectedMinor += s.amount_total;
    if (activated + 14 * 86400000 <= endMs) {
      totals.matureActivatedLearners++;
      const expires = f.access_expires_at ? Date.parse(f.access_expires_at) : Infinity;
      // This is completed practice AFTER activation, not proof that a paid
      // allowance was consumed; Reading/Listening remain free by design.
      const outcomes = practice.filter(p => p.user_id === u && Date.parse(p.completed_at) >= activated
        && Date.parse(p.completed_at) < Math.min(activated + 14 * 86400000, expires));
      if (outcomes.length) totals.firstCompletedPracticeWithin14Days++;
      if (outcomes.some(p => p.kind === 'ai_score')) totals.firstCompletedAiScoreWithin14Days++;
    }
  }
  totals.newPayingLearners = purchasers.size;
  totals.eligiblePurchaseRate = eligible.size ? totals.eligibleNewPayingLearners / eligible.size : null;
  totals.firstPracticeRate = totals.matureActivatedLearners ? totals.firstCompletedPracticeWithin14Days / totals.matureActivatedLearners : null;
  totals.firstAiScoreRate = totals.matureActivatedLearners ? totals.firstCompletedAiScoreWithin14Days / totals.matureActivatedLearners : null;
  for (const revenue of Object.values(totals.revenueByCurrency)) revenue.perEligibleLearnerMinor = eligible.size ? revenue.grossCollectedMinor / eligible.size : null;
  return totals;
}

// Observed signed-in subset only. Ordered identity joins describe a path;
// they do not establish that this offer caused a later purchase.
export function observedOfferPath({ events, practice, sessions, fulfillments, exclusions = [], end, days, offerVersion }) {
  const stop = Date.parse(end), start = stop - days * 86400000;
  const excluded = new Set(exclusions);
  const inWindow = e => (!offerVersion || e.offer_version === offerVersion) && e.user_id && !excluded.has(e.user_id) && Date.parse(e.created_at) >= start && Date.parse(e.created_at) < stop;
  const views = events.filter(e => inWindow(e) && e.event === 'exam_pass_offer_view');
  const unique = new Map();
  for (const e of views) {
    const time = Date.parse(e.created_at);
    if (!unique.has(e.user_id) || time < unique.get(e.user_id)) unique.set(e.user_id, time);
  }
  const result = { windowDays: days, ...(offerVersion ? { offerVersion } : {}), signedInObservedOfferLearners: unique.size,
    withPriorCompletedAiScore: 0, subsequentlyClicked: 0, subsequentlyCreatedExamPassSession: 0,
    subsequentlyActivatedPositiveExamPass: 0, subsequentlyCreatedAnyPlanSession: 0,
    subsequentlyActivatedPositiveAnyPlan: 0 };
  for (const [u,time] of unique) {
    if (!practice.some(p => ['ai_score', 'estimator_ai_score'].includes(p.kind) && p.user_id === u && Date.parse(p.completed_at) <= time && Date.parse(p.completed_at) >= start)) continue;
    result.withPriorCompletedAiScore++;
    const click = events.filter(e => inWindow(e) && e.user_id === u && e.event === 'exam_pass_offer_click' && Date.parse(e.created_at) >= time)
      .sort((a,b) => Date.parse(a.created_at)-Date.parse(b.created_at))[0];
    if (!click) continue;
    result.subsequentlyClicked++;
    const created = sessions.filter(s => s.livemode && (s.client_reference_id || s.metadata?.user_id) === u
      && ['exam_pass', 'week_pass', 'monthly', 'annual'].includes(s.metadata?.sku)
      && s.created * 1000 >= Date.parse(click.created_at) && s.created * 1000 < stop);
    const activated = s => s.status === 'complete' && s.payment_status === 'paid' && s.amount_total > 0
      && fulfillments.some(f => f.session_id === s.id && f.outcome === 'applied'
        && Date.parse(f.fulfilled_at) >= s.created * 1000 && Date.parse(f.fulfilled_at) < stop);
    if (!created.length) continue;
    result.subsequentlyCreatedAnyPlanSession++;
    if (created.some(activated)) result.subsequentlyActivatedPositiveAnyPlan++;
    const passes = created.filter(s => s.metadata?.sku === 'exam_pass');
    if (passes.length) result.subsequentlyCreatedExamPassSession++;
    if (passes.some(activated)) result.subsequentlyActivatedPositiveExamPass++;
  }
  return result;
}


// Exact provider links only. Never match by customer, amount, date proximity or
// arbitrary metadata: those would confuse a renewal with the Checkout invoice.
export function reconcileCheckoutCharges({ sessions, charges, invoicePayments = [] }) {
  const id = value => typeof value === 'string' ? value : value?.id;
  const invoiceIds = new Set(sessions.map(s => id(s.invoice)).filter(Boolean));
  const intentIds = new Set(sessions.map(s => id(s.payment_intent)).filter(Boolean));
  for (const link of invoicePayments) {
    if (invoiceIds.has(id(link.invoice)) && id(link.payment_intent)) intentIds.add(id(link.payment_intent));
  }
  const matched = charges.filter(c => c.livemode && (
    (id(c.payment_intent) && intentIds.has(id(c.payment_intent)))
    || (id(c.invoice) && invoiceIds.has(id(c.invoice)))
  ));
  const settled = matched.filter(c => c.paid && c.status === 'succeeded');
  return {
    matchedCheckoutCharges: settled.length,
    matchedFailedCheckoutCharges: matched.filter(c => c.status === 'failed').length,
    refundedMatchedCheckoutCharges: settled.filter(c => c.amount_refunded > 0).length,
    disputedMatchedCheckoutCharges: settled.filter(c => c.disputed).length,
    note: 'Exact Checkout payment-intent, legacy charge invoice, or InvoicePayment-to-PaymentIntent links only. Successful charges created in the reporting window; failed attempts counted separately. Renewals excluded. Refund/dispute state is current at report time, not reconstructed at the historical window end. Gross revenue is not net revenue; older charges and missing links require separate reconciliation.',
  };
}
