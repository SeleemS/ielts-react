import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/20260901010000_dashboard_perf.sql', import.meta.url),
  'utf8'
);
const sql = migration.toLowerCase();

const indexMigration = readFileSync(
  new URL('../supabase/migrations/20260803190000_activity_events_visitor_idx.sql', import.meta.url),
  'utf8'
).toLowerCase();

const page = readFileSync(new URL('../pages/data.js', import.meta.url), 'utf8');

// The contract between dashboard_overview and pages/data.js. v8 changed where
// the numbers come from; if it ever changes WHAT it returns, the dashboard
// renders blanks with no error, so pin it here.
const TOP_LEVEL_KEYS = [
  'totals',
  'prev_totals',
  'series',
  'countries',
  'breakdowns',
  'funnel',
  'areas',
  'hour_heatmap',
  'session_buckets',
  'returning',
];

const TOTALS_KEYS = [
  'events',
  'visitors',
  'engaged_visitors',
  'signups',
  'submits',
  'questions_answered',
  'purchases',
  'purchasers',
  'payments',
  'login_sessions',
  'revenue_minor',
  'sessions_total',
  'bounce_sessions',
  'median_session_secs',
  'avg_session_secs',
];

const BREAKDOWN_KEYS = [
  'channels',
  'referrers',
  'campaigns',
  'pages_top',
  'pages_entry',
  'pages_exit',
  'browsers',
  'oses',
  'devices',
];

// The final assembly block, so a key that only appears in a comment or an
// unrelated CTE cannot satisfy these assertions.
const assembly = sql.slice(sql.indexOf('select jsonb_build_object(\n    \'totals\''), sql.indexOf('into v_result'));

describe('dashboard perf migration — JSON contract', () => {
  it('keeps every top-level key the /data page consumes', () => {
    expect(assembly.length).toBeGreaterThan(0);
    for (const key of TOP_LEVEL_KEYS) {
      expect(assembly).toContain(`'${key}',`);
    }
  });

  it('keeps every totals field the KPI tiles read', () => {
    for (const key of TOTALS_KEYS) {
      expect(sql).toContain(`as ${key}`);
    }
  });

  it('keeps every breakdown list the cards read', () => {
    for (const key of BREAKDOWN_KEYS) {
      expect(assembly).toContain(`'${key}',`);
    }
  });

  it('still builds totals with row_to_json so field order survives', () => {
    expect(assembly).toContain('row_to_json(totals)::jsonb');
    expect(assembly).toContain('row_to_json(prev_totals)::jsonb');
  });

  it('is the same shape the page destructures', () => {
    expect(page).toContain('data?.totals');
    expect(page).toContain('data?.prev_totals');
    expect(page).toContain('data?.breakdowns');
    expect(page).toContain('data?.session_buckets');
    expect(page).toContain('data?.hour_heatmap');
    expect(page).toContain('data?.returning');
  });
});

describe('dashboard perf migration — rollup design', () => {
  it('creates the four rollup tables plus the watermark', () => {
    for (const table of [
      'activity_daily',
      'activity_daily_visitor',
      'activity_daily_dim',
      'activity_daily_session',
      'activity_daily_state',
    ]) {
      expect(sql).toContain(`create table if not exists public.${table} (`);
    }
  });

  it('keeps the columns the brief pins on activity_daily', () => {
    const table = sql.slice(
      sql.indexOf('create table if not exists public.activity_daily ('),
      sql.indexOf('create table if not exists public.activity_daily_visitor')
    );
    for (const column of ['day', 'country', 'channel', 'event', 'events', 'actors', 'sessions', 'engaged_visitors']) {
      expect(table).toContain(column);
    }
  });

  it('defines each aggregation exactly once, shared by refresh and the live tail', () => {
    for (const fn of ['events', 'visitors', 'dims', 'sessions']) {
      expect(sql).toContain(`create or replace function public.activity_rollup_${fn}(`);
      expect(sql).toContain(`create or replace function public.activity_window_${fn}(`);
      // the window function reads stored rows AND calls the rollup for the tail
      expect(sql).toContain(`select * from public.activity_rollup_${fn}(p_from, v_head)`);
      expect(sql).toContain(`select * from public.activity_rollup_${fn}(v_tail, p_to)`);
    }
  });

  it('only trusts a contiguous watermark, so a skipped cron degrades to raw', () => {
    expect(sql).toContain('create or replace function public.activity_rollup_boundary(');
    expect(sql).toContain('from public.activity_daily_state s where s.day = g.d::date');
    expect(sql).toContain('coalesce(min(g.d)::date, v_closed_to)');
  });

  it('never rolls up today', () => {
    expect(sql).toContain("v_to      date := v_today;");
    expect(sql).toContain("least(v_to::date, (now() at time zone 'utc')::date)");
  });

  it('refresh_activity_daily is idempotent: delete then insert, and marks empty days', () => {
    const refresh = sql.slice(sql.indexOf('create or replace function public.refresh_activity_daily('));
    for (const table of [
      'activity_daily',
      'activity_daily_visitor',
      'activity_daily_dim',
      'activity_daily_session',
    ]) {
      expect(refresh).toMatch(
        new RegExp(`delete from public\\.${table}\\s+where day >= v_from and day < v_to;`)
      );
      expect(refresh).toContain(`insert into public.${table} (`);
    }
    expect(refresh).toContain('insert into public.activity_daily_state (day, refreshed_at)');
    expect(refresh).toContain('on conflict (day) do update set refreshed_at = now()');
  });

  it('is safe to re-run', () => {
    expect(sql).not.toContain('create table public.');
    expect(sql).not.toContain('drop table');
    expect((sql.match(/create index if not exists/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((sql.match(/create or replace function/g) || []).length).toBeGreaterThanOrEqual(11);
  });
});

describe('dashboard perf migration — security', () => {
  it('marks dashboard_overview v8', () => {
    expect(sql).toContain("comment on function public.dashboard_overview(timestamptz, timestamptz, text) is");
    expect(sql).toContain('v8 (20260901010000)');
  });

  it('keeps every new function service-role only', () => {
    const fns = [
      'public.activity_channel(text)',
      'public.activity_rollup_events(timestamptz, timestamptz)',
      'public.activity_rollup_visitors(timestamptz, timestamptz)',
      'public.activity_rollup_dims(timestamptz, timestamptz)',
      'public.activity_rollup_sessions(timestamptz, timestamptz)',
      'public.activity_rollup_boundary(timestamptz, timestamptz)',
      'public.activity_window_events(timestamptz, timestamptz)',
      'public.activity_window_visitors(timestamptz, timestamptz)',
      'public.activity_window_dims(timestamptz, timestamptz)',
      'public.activity_window_sessions(timestamptz, timestamptz)',
      'public.refresh_activity_daily(date)',
      'public.dashboard_overview(timestamptz, timestamptz, text)',
    ];
    for (const fn of fns) {
      expect(sql).toContain(`revoke all on function ${fn} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function ${fn} to service_role;`);
    }
  });

  it('keeps the rollup tables behind RLS with no client grants', () => {
    for (const table of [
      'activity_daily',
      'activity_daily_visitor',
      'activity_daily_dim',
      'activity_daily_session',
      'activity_daily_state',
    ]) {
      expect(sql).toContain(`alter table public.${table}`);
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table}\\s+from anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`grant all on table public\\.${table}\\s+to service_role;`));
    }
  });

  it('every definer function pins an empty search_path', () => {
    const definers = (sql.match(/security definer/g) || []).length;
    const pinned = (sql.match(/set search_path = ''/g) || []).length;
    // activity_channel is immutable rather than definer but still pins a path.
    expect(pinned).toBeGreaterThanOrEqual(definers);
  });
});

describe('the already-applied visitor index', () => {
  it('is committed as its own migration and restated idempotently here', () => {
    expect(indexMigration).toContain(
      'create index if not exists activity_events_visitor_created_idx'
    );
    expect(indexMigration).toContain('applied to prod manually via psql on 2026-08-03');
    expect(sql).toContain('create index if not exists activity_events_visitor_created_idx');
  });
});
