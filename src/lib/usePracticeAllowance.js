// Client view of the free-account Reading/Listening allowance (see
// lib/practiceAllowance.js). Reads the signed-in user's own attempts (RLS:
// owner-select) to find which passages they already used. Fails OPEN: while
// loading, on any error, or when the current passage can't be resolved as new,
// learners are never blocked by a lookup problem.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { FREE_PRACTICE_TESTS, PRACTICE_WALL_ON, practiceAllowanceState } from '../../lib/practiceAllowance';
import { resolvePassageId } from './progress';
import { useAuth } from './auth';
import { usePlan } from './usePlan';

const OPEN = { loading: false, limited: false, canSubmit: true, remaining: Infinity, used: 0, limit: FREE_PRACTICE_TESTS };

export function usePracticeAllowance({ skill, storageKey, enabled = true }) {
  const { user } = useAuth();
  const { loading: planLoading, isPremium } = usePlan();
  const [usage, setUsage] = React.useState({ status: 'idle', usedIds: null, currentId: null });
  const [refreshKey, setRefreshKey] = React.useState(0);
  const active = enabled && PRACTICE_WALL_ON && Boolean(user?.id) && Boolean(storageKey);

  React.useEffect(() => {
    if (!active) {
      setUsage({ status: 'idle', usedIds: null, currentId: null });
      return undefined;
    }
    let live = true;
    setUsage((current) => ({ ...current, status: 'loading' }));
    Promise.all([
      Promise.resolve().then(() => getSupabase()
        .from('attempts')
        .select('passage_id')
        .eq('user_id', user.id)
        .in('skill', ['reading', 'listening'])
        .is('mock_test_id', null)
        .not('passage_id', 'is', null)
        .limit(1000)),
      resolvePassageId(storageKey, skill),
    ])
      .then(([{ data, error }, currentId]) => {
        if (!live) return;
        if (error) {
          setUsage({ status: 'error', usedIds: null, currentId: null });
          return;
        }
        setUsage({ status: 'ready', usedIds: new Set((data || []).map((row) => row.passage_id)), currentId });
      })
      .catch(() => {
        if (live) setUsage({ status: 'error', usedIds: null, currentId: null });
      });
    return () => {
      live = false;
    };
  }, [active, skill, storageKey, user?.id, refreshKey]);

  const refresh = React.useCallback(() => setRefreshKey((n) => n + 1), []);

  // `uncertain` marks a fail-open answer for a signed-in account: the client
  // could not tell, so the caller lets the database decide (the
  // attempts_free_practice_cap trigger rejects an over-cap insert with PT402).
  if (!active) return { ...OPEN, refresh };
  if (planLoading || usage.status === 'loading' || usage.status === 'idle') return { ...OPEN, loading: true, uncertain: true, refresh };
  if (isPremium) return { ...OPEN, refresh };
  // Unknown usage or an unresolvable passage id: never block on a lookup failure.
  if (usage.status !== 'ready' || !usage.currentId) return { ...OPEN, uncertain: true, refresh };
  return { loading: false, ...practiceAllowanceState({ usedIds: usage.usedIds, currentId: usage.currentId }), refresh };
}
