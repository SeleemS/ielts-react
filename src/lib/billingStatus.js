export function billingStatusHeading({ pauseUntil, expiresAt, planStatus, renewsAt, isPremium, now = Date.now() }) {
  if (planStatus === 'refunded') return 'Premium is not active';
  if (pauseUntil && new Date(pauseUntil).getTime() > now) return 'Premium is paused';
  if (planStatus === 'paused') return 'Billing is resuming';
  if (expiresAt && new Date(expiresAt).getTime() <= now) return 'Exam Pass has expired';
  if (planStatus === 'canceled') {
    return isPremium && new Date(renewsAt).getTime() > now ? 'Premium is ending' : 'Premium has ended';
  }
  if (planStatus === 'past_due') return 'Payment needs attention';
  if (expiresAt && isPremium) return 'Exam Pass is active';
  return isPremium ? 'Keep Premium active' : 'Premium is not active';
}

export function billingStatusMessage({
  pauseUntil,
  expiresAt,
  planStatus,
  renewsAt,
  isPremium,
  now = Date.now(),
}) {
  if (planStatus === 'refunded') {
    return 'Premium access is inactive following a payment refund or dispute.';
  }
  if (pauseUntil && new Date(pauseUntil).getTime() > now) {
    return `Your current pause ends ${new Date(pauseUntil).toLocaleDateString()}.`;
  }
  if (planStatus === 'paused') {
    return 'Billing is resuming. Premium access returns after Stripe confirms payment.';
  }
  if (expiresAt) {
    if (new Date(expiresAt).getTime() <= now) {
      return `Your Exam Pass expired ${new Date(expiresAt).toLocaleDateString()}.`;
    }
    if (!isPremium) return 'Your Exam Pass is not currently active.';
    return `Your Exam Pass ends ${new Date(expiresAt).toLocaleDateString()}.`;
  }
  if (planStatus === 'canceled' && renewsAt) {
    if (new Date(renewsAt).getTime() <= now) {
      return `Your Premium access ended ${new Date(renewsAt).toLocaleDateString()}. Your subscription will not renew.`;
    }
    if (!isPremium) return 'Your subscription is canceled and Premium access is not active.';
    return `Your Premium access continues until ${new Date(renewsAt).toLocaleDateString()}. It will not renew.`;
  }
  if (planStatus === 'past_due') {
    return 'Your payment is past due. Update your payment details in Stripe to keep Premium active.';
  }
  if (renewsAt) {
    return `Your next renewal is ${new Date(renewsAt).toLocaleDateString()}.`;
  }
  return isPremium
    ? 'Your Premium tools are active.'
    : 'Your subscription is not currently active.';
}

export function canOfferBillingPause({
  isPremium,
  planStatus,
  renewsAt,
  expiresAt,
  pauseUsedAt,
}) {
  return Boolean(
    isPremium
    && planStatus === 'active'
    && renewsAt
    && !expiresAt
    && !pauseUsedAt
  );
}
