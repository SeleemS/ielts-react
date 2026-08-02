// src/lib/useFreeWritingSample.js
// Whether the signed-in user still has their one lifetime free sample score
// for an AI skill (writing since Jul 2026, speaking since Aug 2026).
// Owner-read of user_quotas (RLS: select own; writes are service-role only) —
// display only, the real gate lives in consume_ai_score.

import * as React from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from './auth';

const SAMPLE_COLUMNS = {
  writing: 'free_writing_score_used_at',
  speaking: 'free_speaking_score_used_at',
};

export function useFreeSample(skill) {
  const { user } = useAuth();
  const column = SAMPLE_COLUMNS[skill] || SAMPLE_COLUMNS.writing;
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
      .select(column)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        // No quota row yet means the sample was never consumed.
        setState({
          loading: false,
          used: error ? null : Boolean(data?.[column]),
        });
      })
      .catch(() => {
        if (active) setState({ loading: false, used: null });
      });
    return () => {
      active = false;
    };
  }, [user?.id, column]);

  return state;
}

export function useFreeWritingSample() {
  return useFreeSample('writing');
}
