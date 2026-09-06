// Operational checkout diagnostics, separate from consent-based browser analytics.
// Never include request bodies, URLs, contact details or raw provider errors.
const STAGES = new Set(['rate_limit', 'catalog', 'coupon', 'customer', 'session']);
export async function recordCheckoutOperation(admin, { userId, sku, requestId, sessionId, stage, created = false }) {
  if (!userId || !['monthly', 'annual', 'exam_pass'].includes(sku) || !STAGES.has(stage)) return false;
  try {
    const { error } = await admin.from('activity_events').insert({
      anon_id: `billing:${userId}`,
      user_id: userId,
      billing_event_id: created ? `checkout_created:${sessionId}` : `checkout_failed:${requestId}`,
      event: created ? 'checkout_session_created' : 'checkout_session_failed',
      props: { source: 'billing_checkout', operational: true, sku, stage,
        ...(created ? { transaction_id: sessionId } : {}) },
    });
    if (error && error.code !== '23505') throw error;
    return true;
  } catch {
    // Observability failure must never turn a successfully created Stripe
    // session into a failed checkout and cause the learner to create another.
    console.error('checkout operational record unavailable');
    return false;
  }
}
