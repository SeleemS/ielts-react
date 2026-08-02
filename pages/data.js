import * as React from 'react';
import Head from 'next/head';
import { DM_Sans } from 'next/font/google';
import { Wifi, Users, Timer, ListChecks, UserPlus, CreditCard } from 'lucide-react';
import {
  T, fmtNum, fmtMoney, fmtDurShort, countryName, flagEmoji, pct,
} from '../src/components/datadash/theme';
import {
  Panel, Card, StatTile, RankedList, LiveDot, Sparkline,
} from '../src/components/datadash/primitives';
import GlobeStage, { Starfield, withDebugPins } from '../src/components/datadash/GlobeStage';
import TrafficChart from '../src/components/datadash/TrafficChart';
import Funnel from '../src/components/datadash/Funnel';
import HourHeatmap from '../src/components/datadash/HourHeatmap';
import LiveFeed from '../src/components/datadash/LiveFeed';
import GlobeView from '../src/components/datadash/GlobeView';

// Private analytics dashboard. Mission-control layout (all first-build data
// points) in the DataFast aesthetic: near-black canvas, DM Sans, blue data
// series, coral reserved for revenue. Password-gated, noindex, absent from
// sitemap and its own telemetry. The 3D live globe opens from the map card.

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-dm' });

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7', label: '7 days' },
  { key: '28', label: '28 days' },
  { key: '90', label: '90 days' },
  { key: 'all', label: 'All time' },
];

const BUCKET_LABELS = ['<30s', '30s–3m', '3–10m', '10–30m', '30–60m', '>1h'];

export async function getServerSideProps({ res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return { props: {} };
}

function useDashboard() {
  const [authed, setAuthed] = React.useState(null);
  const [range, setRange] = React.useState('7');
  const [overview, setOverview] = React.useState(null);
  const [realtime, setRealtime] = React.useState(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadOverview = React.useCallback(async (r = range) => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/data/overview?range=${r}`);
      if (res.status === 401) return setAuthed(false);
      if (!res.ok) return;
      setOverview(await res.json());
      setAuthed(true);
    } finally {
      setRefreshing(false);
    }
  }, [range]);

  const loadRealtime = React.useCallback(async () => {
    const res = await fetch('/api/data/realtime');
    if (res.status === 401) return setAuthed(false);
    if (!res.ok) return;
    setRealtime(await res.json());
    setAuthed(true);
  }, []);

  React.useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  React.useEffect(() => {
    if (authed === false) return undefined;
    loadRealtime();
    const live = setInterval(loadRealtime, 15000);
    const hist = setInterval(() => loadOverview(), 60000);
    return () => {
      clearInterval(live);
      clearInterval(hist);
    };
  }, [authed, loadOverview, loadRealtime]);

  return { authed, setAuthed, range, setRange, overview, realtime, refreshing, loadOverview, loadRealtime };
}

function LoginGate({ onSuccess }) {
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submit = async (evt) => {
    evt.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/data/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) return onSuccess();
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Login failed.');
    } catch {
      setError('Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-xs rounded-2xl border p-6"
        style={{ background: T.panel, borderColor: T.border }}>
        <div className="mb-1 text-[15px] font-bold" style={{ color: T.ink }}>
          <span style={{ color: T.accent }}>{'</>'}</span> ielts-bank.com · data
        </div>
        <p className="mb-4 text-[12px]" style={{ color: T.muted }}>Private dashboard. Enter the access password.</p>
        <input
          type="password" value={password} onChange={(evt) => setPassword(evt.target.value)} autoFocus
          placeholder="Password"
          className="mb-3 w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
          style={{ background: T.canvas, borderColor: T.border, color: T.ink }}
        />
        {error ? <p className="mb-3 text-[12px]" style={{ color: T.down }}>{error}</p> : null}
        <button type="submit" disabled={busy || !password}
          className="w-full rounded-lg py-2 text-[13px] font-bold disabled:opacity-50"
          style={{ background: T.accent, color: '#0B0E13' }}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}

function change(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export default function DataDashboard() {
  const dash = useDashboard();
  const { authed, overview, realtime, refreshing } = dash;
  const data = overview?.data;
  const live = realtime?.data;
  const totals = data?.totals || {};
  const prev = data?.prev_totals || {};
  const breakdowns = data?.breakdowns || {};
  const ai = overview?.ai;
  const [showGlobe, setShowGlobe] = React.useState(false);

  // Size the embedded globe to the space left of the happening-now panel.
  const stageWrapRef = React.useRef(null);
  const [stageSize, setStageSize] = React.useState(480);
  React.useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setStageSize(Math.max(300, Math.min(el.clientWidth * 0.96, 560)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [authed]);
  const activeVisitors = React.useMemo(() => withDebugPins(live?.active), [live]);

  const showDeltas = dash.range !== 'all' && (prev.visitors || 0) > 0;
  const delta = (key) => (showDeltas ? change(totals[key] || 0, prev[key] || 0) : null);
  const rangeLabel = RANGES.find((r) => r.key === dash.range)?.label || '';

  const logout = async () => {
    await fetch('/api/data/login', { method: 'DELETE' });
    dash.setAuthed(false);
  };

  return (
    <div className={`${dmSans.variable} min-h-screen`}
      style={{ background: T.canvas, color: T.ink, fontFamily: 'var(--font-dm), ui-sans-serif, system-ui, sans-serif' }}>
      <Head>
        <title>Data · IELTS Bank</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
      </Head>
      <style jsx global>{`
        @keyframes dashSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes dashGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(62, 207, 142, 0); }
          50% { box-shadow: 0 0 12px 1px rgba(62, 207, 142, 0.35); }
        }
      `}</style>

      {authed === null && (
        <div className="flex min-h-screen items-center justify-center text-[13px]" style={{ color: T.faint }}>
          Loading…
        </div>
      )}
      {authed === false && (
        <LoginGate onSuccess={() => { dash.setAuthed(true); dash.loadOverview(); dash.loadRealtime(); }} />
      )}

      {authed && (
        <main className="mx-auto max-w-[1240px] px-4 py-5 md:px-6">
          {/* Header + the one filter row that scopes everything below it */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h1 className="text-[17px] font-bold tracking-tight">
                <span style={{ color: T.accent }}>{'</>'}</span> IELTS Bank · Mission Control
              </h1>
              <p className="text-[11px]" style={{ color: T.faint }}>
                First-party activity_events · bots filtered · updates live every 15s
              </p>
            </div>
            <div
              className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
              style={{ borderColor: T.border, background: T.panel }}
            >
              <LiveDot />
              <span style={{ color: T.ink }}>{live ? fmtNum(live.active_now) : '–'} online now</span>
            </div>
            <div
              className="flex overflow-hidden rounded-full border text-[12px]"
              style={{ borderColor: T.border, background: T.panel }}
            >
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => dash.setRange(r.key)}
                  className="px-3 py-1.5 font-semibold transition-colors"
                  style={dash.range === r.key ? { background: T.divider, color: T.ink } : { color: T.muted }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button onClick={logout} className="text-[11px] underline-offset-2 hover:underline" style={{ color: T.faint }}>
              Sign out
            </button>
          </div>

          <div style={{ opacity: refreshing && data ? 0.55 : 1, transition: 'opacity 200ms' }}>
            {/* KPI row */}
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile
                label="Online now"
                value={live ? fmtNum(live.active_now) : '–'}
                sub={live ? `${fmtNum(live.last_hour_visitors)} last hour` : ''}
                icon={Wifi}
                tint={T.live}
                live={Boolean(live?.active_now)}
              />
              <StatTile
                label={`Visitors · ${rangeLabel}`}
                value={fmtNum(totals.visitors)}
                deltaPct={delta('visitors')}
                sub={totals.engaged_visitors != null ? `${fmtNum(totals.engaged_visitors)} engaged` : ''}
                icon={Users}
                tint={T.line}
              />
              <StatTile
                label="Avg session"
                value={fmtDurShort(totals.avg_session_secs)}
                sub={`median ${fmtDurShort(totals.median_session_secs)}`}
                icon={Timer}
                tint="#9085E9"
              />
              <StatTile
                label="Questions answered"
                value={fmtNum(totals.questions_answered)}
                deltaPct={delta('questions_answered')}
                sub={`${fmtNum(totals.submits)} full submits`}
                icon={ListChecks}
                tint={T.mapHigh}
              />
              <StatTile
                label="Sign-ups"
                value={fmtNum(totals.signups)}
                deltaPct={delta('signups')}
                sub={live?.registered_users != null ? `${fmtNum(live.registered_users)} registered all-time` : ''}
                icon={UserPlus}
                tint={T.up}
              />
              <StatTile
                label="Purchases"
                value={fmtNum(totals.purchases)}
                deltaPct={delta('purchases')}
                sub={totals.revenue_minor > 0 ? `${fmtMoney(totals.revenue_minor)} gross` : ''}
                icon={CreditCard}
                tint={T.accent}
              />
            </div>

            {/* The live globe, embedded — feed floats over the starfield */}
            <Card
              title="Around the world"
              subtitle={`Live globe · sign-ups (blue) for ${rangeLabel.toLowerCase()} · green pins are sessions active in the last 5 minutes`}
              className="mb-3"
              right={
                <div className="flex items-center gap-2">
                  <span
                    className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-widest"
                    style={{ borderColor: 'rgba(62,207,142,0.4)', color: T.live, animation: 'dashGlow 2.4s ease-in-out infinite' }}
                  >
                    <LiveDot size={6} /> LIVE
                  </span>
                  <button
                    onClick={() => setShowGlobe(true)}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-bold"
                    style={{ borderColor: T.border, background: T.panelHover, color: T.ink }}
                    title="Open full screen"
                  >
                    ⛶ Expand
                  </button>
                </div>
              }
            >
              <div
                className="relative overflow-hidden rounded-xl border p-3 lg:pr-[324px]"
                style={{ background: T.space, borderColor: T.divider }}
              >
                <Starfield />
                <div ref={stageWrapRef} className="relative flex items-center justify-center">
                  <GlobeStage active={activeVisitors} countries={data?.countries} size={stageSize} />
                </div>
                <div
                  className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 text-[10px]"
                  style={{ color: T.faint }}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: T.live }} /> live now
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-6 rounded-sm"
                      style={{ background: `linear-gradient(to right, rgba(90,169,230,0.15), rgba(90,169,230,0.55))` }}
                    />
                    sign-ups
                  </span>
                  <span>hover a country · drag to spin</span>
                </div>
                {/* Happening-now overlay (stacks below the globe on small screens) */}
                <div
                  className="relative mt-3 flex flex-col rounded-xl border p-3 lg:absolute lg:bottom-3 lg:right-3 lg:top-3 lg:mt-0 lg:w-[300px]"
                  style={{ background: 'rgba(22,27,35,0.88)', borderColor: T.border, backdropFilter: 'blur(6px)' }}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.muted }}>
                      Happening now
                    </span>
                    {live?.active_countries?.length ? (
                      <div className="flex max-w-[140px] flex-wrap justify-end gap-1">
                        {live.active_countries.slice(0, 3).map((c) => (
                          <span
                            key={c.c}
                            title={countryName(c.c)}
                            className="rounded-full border px-1.5 py-0.5 text-[10px]"
                            style={{ borderColor: T.border, color: T.muted }}
                          >
                            {flagEmoji(c.c)} {c.n}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="mb-2 border-b pb-2" style={{ borderColor: T.divider }}>
                    <Sparkline points={live?.per_minute} width={280} height={34} />
                    <div className="mt-0.5 text-[10px]" style={{ color: T.faint }}>
                      {fmtNum(live?.last_hour_events || 0)} events · last 60 min
                    </div>
                  </div>
                  <div className="min-h-0 flex-1">
                    <LiveFeed feed={live?.feed} fill maxHeight={340} />
                  </div>
                </div>
              </div>
            </Card>

            {/* Countries + acquisition + funnel */}
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
              <Card title="Top countries" subtitle="Engaged visitors · revenue in coral" className="xl:col-span-4">
                <RankedList
                  rows={(data?.countries || []).slice(0, 9).map((row) => ({
                    label: countryName(row.c),
                    icon: flagEmoji(row.c),
                    value: row.engaged ?? row.visitors,
                    revenue: row.revenue_minor || 0,
                    suffix: row.signups ? `${row.signups} ↑` : '',
                  }))}
                  maxRows={9}
                />
              </Card>
              <Card title="Acquisition" subtitle="First-touch source → sign-up rate" className="xl:col-span-3">
                <RankedList
                  rows={(breakdowns.referrers || []).map((row) => ({
                    label: row.label,
                    value: row.visitors,
                    revenue: row.revenue_minor || 0,
                    suffix: pct(row.signups || 0, Math.max(1, row.visitors)) + ' ↑',
                  }))}
                  maxRows={8}
                />
              </Card>
              <Card title="Conversion funnel" subtitle="Distinct visitors reaching each stage" className="xl:col-span-5">
                <Funnel funnel={data?.funnel} />
              </Card>
            </div>

            {/* AI visibility: channel rollup + crawler telemetry */}
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
              <Card title="Channels" subtitle="AI assistants vs search, social, direct" className="xl:col-span-4">
                <RankedList
                  rows={(breakdowns.channels || []).map((row) => ({
                    label: row.label,
                    value: row.visitors,
                    revenue: row.revenue_minor || 0,
                    suffix: pct(row.signups || 0, Math.max(1, row.visitors)) + ' ↑',
                  }))}
                  maxRows={6}
                />
              </Card>
              <Card title="AI crawlers" subtitle="Server-side fetches by agent" className="xl:col-span-4">
                <RankedList
                  rows={(ai?.agents || []).map((row) => ({
                    label: row.label,
                    value: row.hits,
                    suffix: `${fmtNum(row.paths)} pages`,
                  }))}
                  maxRows={6}
                  emptyLabel="No crawler hits recorded yet"
                />
              </Card>
              <Card title="Read by assistants" subtitle="Pages fetched inside live AI answers" className="xl:col-span-4">
                <RankedList
                  rows={(ai?.top_paths || []).map((row) => ({
                    label: row.label,
                    value: row.hits,
                  }))}
                  maxRows={6}
                  emptyLabel="No assistant fetches yet"
                />
              </Card>
            </div>

            {/* Rhythm + time allocation */}
            <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
              <Card title="Weekly rhythm" subtitle="Events by hour · always the last 7 days" className="xl:col-span-7">
                <HourHeatmap cells={data?.hour_heatmap} />
              </Card>
              <Card title="Where time goes" subtitle="Engaged time by section (60s heartbeats)" className="xl:col-span-5">
                <RankedList
                  rows={(data?.areas || []).map((area) => ({
                    label: area.area,
                    value: area.secs,
                    suffix: `${fmtNum(area.sessions)} sess.`,
                  }))}
                  valueFmt={fmtDurShort}
                  maxRows={9}
                />
              </Card>
            </div>

            {/* Traffic + session length */}
            <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
              <Card
                title="Traffic over time"
                subtitle={overview?.bucket === 'hour' ? 'Hourly · UTC' : 'Daily · UTC'}
                className="xl:col-span-8"
              >
                <TrafficChart series={data?.series} bucket={overview?.bucket} />
              </Card>
              <Card
                title="Session length"
                subtitle={
                  data?.returning
                    ? `${pct(data.returning.returning, data.returning.visitors)} returning · median ${fmtDurShort(totals.median_session_secs)}`
                    : undefined
                }
                className="xl:col-span-4"
              >
                <RankedList
                  rows={(data?.session_buckets || []).map((bucket) => ({
                    label: BUCKET_LABELS[Number(bucket.bucket)] || bucket.bucket,
                    value: bucket.sessions,
                  }))}
                  maxRows={6}
                />
              </Card>
            </div>

            {/* Top content */}
            <Card title="Top content" subtitle="Page views in range">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left" style={{ color: T.faint }}>
                      <th className="py-1.5 pr-2 font-semibold">Path</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">Views</th>
                      <th className="py-1.5 text-right font-semibold">Visitors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(breakdowns.pages_top || []).map((page) => (
                      <tr key={page.label} className="border-t" style={{ borderColor: T.divider }}>
                        <td className="max-w-[440px] truncate py-1.5 pr-2" style={{ color: T.muted }}>
                          {page.label}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums font-semibold" style={{ color: T.ink }}>
                          {fmtNum(page.views)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums" style={{ color: T.muted }}>
                          {fmtNum(page.visitors)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <p className="mt-4 text-center text-[10px]" style={{ color: T.faint }}>
              {fmtNum(totals.engaged_visitors || 0)} engaged of {fmtNum(totals.visitors || 0)} visitors · revenue{' '}
              {fmtMoney(totals.revenue_minor || 0)} · logins deduped · all times UTC
            </p>
          </div>

          {showGlobe && (
            <GlobeView realtime={realtime} countries={data?.countries} onClose={() => setShowGlobe(false)} />
          )}
        </main>
      )}
    </div>
  );
}
