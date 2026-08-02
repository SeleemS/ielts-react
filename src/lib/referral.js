// src/lib/referral.js
// Client-side referral plumbing:
//   * captureReferralCode(): stash a ?ref= code from the URL (last-wins,
//     independent of first-touch attribution — referral redemption has its own
//     server-side freshness checks).
//   * redeemStoredReferral(accessToken): one-shot POST to /api/referral/redeem
//     after sign-in; the stored code is cleared whatever the outcome so a bad
//     code never retries forever.
//   * useReferral(): the signed-in user's own share code + credit state for
//     the invite card (code via the owner-callable RPC, credits via the
//     owner-readable user_quotas row).

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from './auth';
import { track } from './analytics';

const REF_KEY = 'ielts-ref-code';
const REDEEMED_KEY = 'ielts-ref-redeemed';

export function captureReferralCode() {
  if (typeof window === 'undefined') return;
  try {
    const code = new URLSearchParams(window.location.search).get('ref') || '';
    if (/^[a-z0-9]{8}$/i.test(code)) {
      window.localStorage.setItem(REF_KEY, code.toLowerCase());
    }
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export async function redeemStoredReferral(accessToken) {
  if (typeof window === 'undefined' || !accessToken) return;
  let code = '';
  try {
    if (window.localStorage.getItem(REDEEMED_KEY) === '1') return;
    code = window.localStorage.getItem(REF_KEY) || '';
  } catch {
    return;
  }
  if (!code) return;
  try {
    const res = await fetch('/api/referral/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    // 503s may be transient: keep the code for a later session. Everything
    // else (redeemed, invalid, self, too old) is terminal.
    if (res.status === 503) return;
    try {
      window.localStorage.setItem(REDEEMED_KEY, '1');
      window.localStorage.removeItem(REF_KEY);
    } catch {
      /* ignore */
    }
    track('referral_redeem', {
      outcome: data?.ok ? (data?.credited ? 'credited' : 'recorded') : data?.reason || 'rejected',
    });
  } catch {
    /* network failure — retry next session */
  }
}

export function useReferral() {
  const { user } = useAuth();
  const [state, setState] = React.useState({
    loading: true,
    code: null,
    credits: 0,
    referredCount: 0,
  });

  React.useEffect(() => {
    if (!user?.id) {
      setState({ loading: false, code: null, credits: 0, referredCount: 0 });
      return undefined;
    }
    let active = true;
    const supabase = getSupabase();
    Promise.all([
      supabase.rpc('get_or_create_referral_code', { p_uid: user.id }),
      supabase.from('user_quotas').select('referral_bonus_scores').maybeSingle(),
      supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_user_id', user.id)
        .not('credited_at', 'is', null),
    ])
      .then(([codeRes, quotaRes, countRes]) => {
        if (!active) return;
        setState({
          loading: false,
          code: codeRes.error ? null : codeRes.data,
          credits: quotaRes.data?.referral_bonus_scores || 0,
          referredCount: countRes.count || 0,
        });
      })
      .catch(() => {
        if (active) setState({ loading: false, code: null, credits: 0, referredCount: 0 });
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  return state;
}
