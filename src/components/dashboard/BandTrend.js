import * as React from 'react';
import NextLink from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react';
import { SKILL_META, SKILL_ORDER, bandDescriptor, formatBand } from './utils';
import ShareRow from '../ShareRow';

const WIDTH = 640;
const HEIGHT = 220;
const PAD_X = 34;
const PAD_Y = 22;

function chartPoints(series) {
  const visible = series.slice(-10);
  const usableWidth = WIDTH - PAD_X * 2;
  const usableHeight = HEIGHT - PAD_Y * 2;
  return visible.map((band, index) => ({
    x: visible.length === 1 ? WIDTH / 2 : PAD_X + (usableWidth * index) / (visible.length - 1),
    y: PAD_Y + usableHeight * (1 - band / 9),
    band,
  }));
}

function TrendChart({ skill, series, targetBand, isPremium }) {
  const meta = SKILL_META[skill];
  const points = chartPoints(series);
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = points.length > 1
    ? `${line} L ${points.at(-1).x.toFixed(1)} ${HEIGHT - PAD_Y} L ${points[0].x.toFixed(1)} ${HEIGHT - PAD_Y} Z`
    : '';
  const targetY = targetBand == null ? null : PAD_Y + (HEIGHT - PAD_Y * 2) * (1 - targetBand / 9);
  const gradientId = `trend-gradient-${skill}`;

  if (!points.length) {
    const Icon = meta.icon;
    return (
      <div className="flex h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
        <p className="mt-4 text-sm font-semibold text-slate-800">No {meta.label.toLowerCase()} trend yet</p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
          {!isPremium && (skill === 'writing' || skill === 'speaking')
            ? `Unlock AI scoring to see your ${meta.label} band trend.`
            : 'Your score journey will appear after your first submission.'}
        </p>
        {!isPremium && (skill === 'writing' || skill === 'speaking') ? (
          <NextLink
            href={`/pricing?upgrade=${skill}`}
            className="mt-3 text-xs font-bold text-emerald-700 underline-offset-4 hover:underline"
          >
            Unlock AI scoring →
          </NextLink>
        ) : null}
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[220px] w-full overflow-visible" role="img" aria-label={`${meta.label} band score trend`}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[3, 5, 7, 9].map((band) => {
        const y = PAD_Y + (HEIGHT - PAD_Y * 2) * (1 - band / 9);
        return (
          <g key={band}>
            <line x1={PAD_X} x2={WIDTH - PAD_X} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 6" />
            <text x="3" y={y + 4} fill="#94a3b8" fontSize="11">{band}.0</text>
          </g>
        );
      })}
      {targetY !== null && (
        <g>
          <line x1={PAD_X} x2={WIDTH - PAD_X} y1={targetY} y2={targetY} stroke="#0f172a" strokeDasharray="7 6" opacity="0.45" />
          <text x={WIDTH - PAD_X} y={targetY - 7} fill="#475569" fontSize="11" textAnchor="end">Target {formatBand(targetBand)}</text>
        </g>
      )}
      {area && <path d={area} fill={`url(#${gradientId})`} />}
      {points.length > 1 && <path d={line} fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {points.map((point, index) => (
        <g key={`${point.x}-${point.y}`}>
          <circle cx={point.x} cy={point.y} r={index === points.length - 1 ? 7 : 5} fill="white" stroke="#059669" strokeWidth="3" />
          {index === points.length - 1 && (
            <text x={point.x} y={point.y - 14} textAnchor="middle" fill="#047857" fontSize="12" fontWeight="700">
              {formatBand(point.band)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function Delta({ value }) {
  if (value === null || Math.abs(value) < 0.01) {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><Minus className="h-3 w-3" /> Steady</span>;
  }
  const positive = value > 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${positive ? 'text-emerald-700' : 'text-rose-600'}`}>
      <Icon className="h-3 w-3" />
      {positive ? '+' : ''}{value.toFixed(1)} latest
    </span>
  );
}

export default function BandTrend({ skills, targetBand, isPremium = false }) {
  const firstWithData = SKILL_ORDER.find((key) => skills[key].series.length) || 'reading';
  const [selected, setSelected] = React.useState(firstWithData);
  const selectedStats = skills[selected];

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]" aria-labelledby="trend-heading">
      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.55)] sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Performance lab</p>
            <h2 id="trend-heading" className="mt-2 text-xl font-black tracking-tight text-slate-950">Band score trajectory</h2>
            <p className="mt-1 text-sm text-slate-500">Your last 10 scored submissions for each skill.</p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Select skill trend">
            {SKILL_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected === key}
                onClick={() => setSelected(key)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${selected === key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {SKILL_META[key].label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5">
          <TrendChart skill={selected} series={selectedStats.series} targetBand={targetBand} isPremium={isPremium} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-5">
            <div><span className="text-xs text-slate-400">Average</span><p className="text-lg font-black text-slate-900">{formatBand(selectedStats.avg)}</p></div>
            <div><span className="text-xs text-slate-400">Personal best</span><p className="text-lg font-black text-slate-900">{formatBand(selectedStats.best)}</p></div>
          </div>
          <Delta value={selectedStats.delta} />
        </div>
        {selectedStats.series.length ? (
          <ShareRow
            className="mt-4 justify-start"
            source="dashboard_trend"
            path="/"
            text={
              selectedStats.series.length > 1 &&
              selectedStats.series.at(-1) > selectedStats.series[0]
                ? `My IELTS ${SKILL_META[selected].label} band went from ${formatBand(selectedStats.series[0])} to ${formatBand(selectedStats.series.at(-1))} practising on IELTS-Bank`
                : `I'm tracking my IELTS band on IELTS-Bank — free practice with instant marking`
            }
          />
        ) : null}
      </div>

      <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-[0_24px_65px_-35px_rgba(2,6,23,0.85)] sm:p-7">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Skill pulse</p>
        </div>
        <div className="mt-6 space-y-5">
          {SKILL_ORDER.map((key) => {
            const meta = SKILL_META[key];
            const stats = skills[key];
            const Icon = meta.icon;
            const width = Math.max(3, ((stats.latest || 0) / 9) * 100);
            return (
              <div key={key}>
                <div className="flex items-end justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-emerald-300"><Icon className="h-4 w-4" /></span>
                    <div><p className="text-sm font-bold">{meta.label}</p><p className="text-[11px] text-slate-400">{bandDescriptor(stats.latest)}</p></div>
                  </div>
                  <span className="text-lg font-black tabular-nums">{formatBand(stats.latest)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-300" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
