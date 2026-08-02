// src/lib/useFreeWritingSample.js
// Whether the signed-in user still has their one lifetime free Writing sample
// score. Owner-read of user_quotas (RLS: select own; writes are service-role
// only) — display only, the real gate lives in consume_ai_score.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from './auth';

export function useFreeWritingSample() {
  const { user } = useAuth();
  const [state, setState] = React.useState({ loading: true, used: null });

  React.useEffect(() => {
    if (!user?.id) {
      setState({ loading: false, used: null });
      return undefined;
    }
    let active = true;
    setState({ loading: true, used: null });
    getSupabase()
      .from('user_quotas')
      .select('free_writing_score_used_at')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        // No quota row yet means the sample was never consumed.
        setState({
          loading: false,
          used: error ? null : Boolean(data?.free_writing_score_used_at),
        });
      })
      .catch(() => {
        if (active) setState({ loading: false, used: null });
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  return state;
}
