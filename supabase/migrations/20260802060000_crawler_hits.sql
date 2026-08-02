-- AI crawler telemetry (LLM-visibility plan 2026-08-02, engineering item #7).
-- Edge middleware logs one row per page fetch by a known AI/search crawler.
-- ChatGPT-User / Claude-User / Perplexity-User hits on a URL are a direct
-- proxy for "an assistant is reading this page inside an answer" — the
-- ground-truth feedback loop for the AEO work.

create table if not exists public.crawler_hits (
  id bigint generated always as identity primary key,
  hit_at timestamptz not null default now(),
  agent text not null,
  path text not null
);

create index if not exists crawler_hits_at_idx on public.crawler_hits (hit_at desc);
create index if not exists crawler_hits_agent_at_idx on public.crawler_hits (agent, hit_at desc);

-- Service-role only (middleware writes with the service key; no client access).
alter table public.crawler_hits enable row level security;

-- Range-scoped rollup for the /data dashboard: hits per agent, plus the pages
-- most read by the live assistant fetchers (the citation-relevant agents).
create or replace function public.dashboard_ai_crawlers(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
security definer
set search_path = public
as $$
select jsonb_build_object(
  'agents', coalesce((
    select jsonb_agg(jsonb_build_object('label', agent, 'hits', hits, 'paths', paths)
                     order by hits desc)
    from (
      select agent, count(*)::int as hits, count(distinct path)::int as paths
      from public.crawler_hits
      where hit_at >= p_from and hit_at <= p_to
      group by 1
    ) a
  ), '[]'::jsonb),
  'top_paths', coalesce((
    select jsonb_agg(jsonb_build_object('label', path, 'hits', hits) order by hits desc)
    from (
      select path, count(*)::int as hits
      from public.crawler_hits
      where hit_at >= p_from and hit_at <= p_to
        and agent in ('ChatGPT-User', 'OAI-SearchBot', 'Claude-User', 'Claude-SearchBot',
                      'Perplexity-User', 'PerplexityBot', 'DuckAssistBot')
      group by 1
      order by 2 desc
      limit 9
    ) p
  ), '[]'::jsonb)
);
$$;

revoke all on function public.dashboard_ai_crawlers(timestamptz, timestamptz) from public;
revoke all on function public.dashboard_ai_crawlers(timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.dashboard_ai_crawlers(timestamptz, timestamptz) to service_role;
