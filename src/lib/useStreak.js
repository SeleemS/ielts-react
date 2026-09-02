// src/lib/useStreak.js
// Current practice streak for the signed-in user, fetched from their own
// attempts (RLS: owner-select, created_at only — a few KB even for heavy
// users). `assumeToday` lets the post-submit results screen count the attempt
// that was just recorded without waiting for a refetch.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from './auth';
import { computeStreakStats } from './streak';

const WINDOW_DAYS = 120;

export function useStreak({ assumeToday = false } = {}) {
  const { user } = useAuth();
  const [state, setState] = React.useState({ loading: true, streak: 0, bestStreak: 0, practicedToday: false });

  React.useEffect(() => {
    if (!user?.id) {
      setState({
        loading: false,
        practicedToday: assumeToday,
        bestStreak: assumeToday ? 1 : 0,
        streak: assumeToday ? computeStreakStats([], { assumeToday: true }).streak : 0,
      });
      return undefined;
    }
    let active = true;
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
    // No user filter needed: attempts RLS is owner-select, same as dashboard.
    getSupabase()
      .from('attempts')
      .select('created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (!active) return;
        const dates = error ? [] : (data || []).map((row) => row.created_at);
        setState({ loading: false, ...computeStreakStats(dates, { assumeToday }) });
      })
      .catch(() => {
        if (active) setState({ loading: false, ...computeStreakStats([], { assumeToday }) });
      });
    return () => {
      active = false;
    };
  }, [user?.id, assumeToday]);

  return state;
}
