// One-click checkout from an upgrade prompt: POST /api/billing/checkout and
// go straight to Stripe, skipping the pricing page. Oct 2026: 99 learners
// reached pricing in 14 days and only 4 started checkout, while the buyers
// who converted went from a gate to Stripe in minutes.
//
// Falls back to the pricing page (with the same upgrade context) whenever a
// direct start isn't possible: signed out, no session token, or an anonymous
// account. Server refusals (e.g. a pass already active) come back as `error`.

import * as React from 'react';
import { buildUpgradeHref, normalizeUpgradeContext } from '../../lib/upgradeContext';
import { getSupabase } from '../../lib/supabase';
import { getSessionAccess } from './sessionAccess';
import { gaClientId, track } from './analytics';
import { trackBeginCheckout, trackSelectItem } from './ecommerce';
import { useAuth } from './auth';

export function useDirectCheckout({ upgrade, stage = 'saved', returnTo = '', ppp = false, source }) {
  const { user } = useAuth();
  const [busySku, setBusySku] = React.useState(null);
  const [error, setError] = React.useState('');
  const busyRef = React.useRef(false);
  const origin = source || upgrade || 'gate';

  const pricingHref = React.useCallback(
    (sku) => `${buildUpgradeHref({ upgrade, stage, return_to: returnTo })}${sku ? `#${sku.replace('_', '-')}` : ''}`,
    [upgrade, stage, returnTo]
  );

  const start = React.useCallback(async (sku) => {
    if (busyRef.current) return;
    setError('');
    track('plan_select', { sku, source: origin, direct: true, signed_in: Boolean(user && !user.is_anonymous) });
    if (!user || user.is_anonymous) {
      window.location.assign(pricingHref(sku));
      return;
    }
    busyRef.current = true;
    setBusySku(sku);
    track('checkout_start', { sku, source: origin, ppp, direct: true });
    trackSelectItem(sku, ppp, { direct: true });
    trackBeginCheckout(sku, ppp, origin, { direct: true });
    try {
      const { accessToken } = await getSessionAccess(getSupabase);
      if (!accessToken) {
        window.location.assign(pricingHref(sku));
        return;
      }
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          sku,
          ga_cid: gaClientId(),
          ...normalizeUpgradeContext({ upgrade, stage, return_to: returnTo }),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.url) {
        track('checkout_redirect_attempt', { sku, source: origin, direct: true });
        window.location.assign(body.url);
        return;
      }
      track('checkout_client_failed', { sku, source: origin, direct: true, http_status: response.status });
      if (body.code === 'anonymous_user') {
        window.location.assign(pricingHref(sku));
        return;
      }
      setError(body.error || 'Could not start checkout. Please try again.');
    } catch {
      track('checkout_client_failed', { sku, source: origin, direct: true, failure_stage: 'network' });
      setError('Could not start checkout. Please try again.');
    } finally {
      busyRef.current = false;
      setBusySku(null);
    }
  }, [origin, ppp, pricingHref, returnTo, stage, upgrade, user]);

  return { start, busySku, error, pricingHref };
}
