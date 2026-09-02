-- 20260803190000_activity_events_visitor_idx.sql
-- dashboard_overview was hitting the 8s statement timeout on prod (22
-- occurrences on /api/data/overview over 2026-08-02/03). Profiling showed
-- ~94% of the time in the returning_share CTE: its correlated EXISTS probes
-- coalesce(user_id::text, anon_id), which no index covered, so every distinct
-- visitor in the window triggered a scan of all pre-window rows (364 visitors
-- x ~29k rows = 7.4M buffer hits for a 7d window). This expression index makes
-- each probe an index lookup: 7d window 7.3s -> 0.54s, 'all' 1.1s.
--
-- Applied to prod manually via psql on 2026-08-03 (as CREATE INDEX
-- CONCURRENTLY; supabase CLI migration tracking is desynced). This file is the
-- committed record and stays idempotent for replay.

create index if not exists activity_events_visitor_created_idx
  on public.activity_events ((coalesce(user_id::text, anon_id)), created_at);
