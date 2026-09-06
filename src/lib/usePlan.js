// src/lib/usePlan.js
// Reads the signed-in user's billing state from their own `users` row (RLS:
// owner-select). Client-side display only — every real gate is enforced
// server-side (scoring RPC, checkout, webhook). Never trust isPremium here
// for anything but UI.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { isPremiumRow } from '../../lib/premium';
import { useAuth } from './auth';

export function isPremiumActive(plan, planStatus, renewsAt, expiresAt = null, pauseUntil = null) {
  return isPremiumRow({
    plan,
    plan_status: planStatus,
    plan_renews_at: renewsAt,
    plan_expires_at: expiresAt,
    billing_pause_until: pauseUntil,
  });
}

// Several components mount usePlan on the same page (global reminder modal,
// ad units, page-level gates), and each instance used to run its own identical
// `users` select — 1-3 duplicate round trips per navigation. Deduping the
// IN-FLIGHT request lets simultaneous consumers share one fetch while keeping
// zero staleness: once the request settles, the next mount fetches fresh.
let inFlight = { userId: null, promise: null };

function fetchPlanRow(userId) {
  if (inFlight.userId === userId && inFlight.promise) return inFlight.promise;
  // PostgREST builders are thenables, not native Promises. Assimilate the
  // builder before finally(), and route synchronous setup failures through
  // the same rejection handler as network failures.
  const promise = Promise.resolve().then(() => getSupabase()
    .from('users')
    .select('plan, plan_sku, plan_status, plan_renews_at, plan_expires_at, billing_pause_until, billing_pause_used_at, stripe_customer_id')
    .eq('id', userId)
    .maybeSingle())
    .finally(() => {
      if (inFlight.promise === promise) inFlight = { userId: null, promise: null };
    });
  inFlight = { userId, promise };
  return promise;
}

export function usePlan() {
  const { user } = useAuth();
  const [state, setState] = React.useState({
    loading: true,
    plan: 'free',
    planSku: null,
    planStatus: 'inactive',
    renewsAt: null,
    expiresAt: null,
    pauseUntil: null,
    pauseUsedAt: null,
    hasBillingAccount: false,
    error: null,
  });

  React.useEffect(() => {
    if (!user?.id) {
      setState({ loading: false, plan: 'free', planSku: null, planStatus: 'inactive', renewsAt: null, expiresAt: null, pauseUntil: null, pauseUsedAt: null, hasBillingAccount: false, error: null });
      return undefined;
    }
    let active = true;
    // The prior effect may have completed in the signed-out state. Restore the
    // loading barrier before querying the newly authenticated owner so billing
    // consumers never render stale Free or previous-account actions.
    setState((current) => ({ ...current, loading: true, error: null }));
    fetchPlanRow(user.id)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setState((current) => ({
            ...current,
            loading: false,
            error: 'Could not verify your current plan. Please refresh and try again.',
          }));
          return;
        }
        setState({
          loading: false,
          plan: data?.plan || 'free',
          planSku: data?.plan_sku || null,
          planStatus: data?.plan_status || 'inactive',
          renewsAt: data?.plan_renews_at || null,
          expiresAt: data?.plan_expires_at || null,
          pauseUntil: data?.billing_pause_until || null,
          pauseUsedAt: data?.billing_pause_used_at || null,
          hasBillingAccount: Boolean(data?.stripe_customer_id),
          error: null,
        });
      })
      .catch(() => {
        if (active) {
          setState((current) => ({
            ...current,
            loading: false,
            error: 'Could not verify your current plan. Please refresh and try again.',
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  return {
    ...state,
    isPremium: isPremiumActive(
      state.plan,
      state.planStatus,
      state.renewsAt,
      state.expiresAt,
      state.pauseUntil
    ),
  };
}
