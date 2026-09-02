// lib/weeklyScorecard.js
// Presentation for the Monday scorecard: shared by /api/cron/weekly-scorecard
// (email) and the /data card, so the two can never disagree about what a
// number means or whether it is on target.
//
// The numbers themselves come from the weekly_scorecard() RPC — every metric
// definition, including the MRR method, lives in
// supabase/migrations/20260901030000_weekly_scorecard.sql. Nothing here
// recomputes a metric; it only formats.

export const SCORECARD_KEYS = [
  'visitors_per_day',
  'ai_google_per_day',
  'free_reports_per_day',
  'week2_pct',
  'paywall_paid_pct',
  'new_payers',
  'mrr_usd',
  'failed_renewal_pct',
];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// "–" is the honest answer for a metric with no data yet (e.g. week-2 return
// before any cohort has finished its 14 days). Never render null as 0.
export function formatScorecardValue(value, unit) {
  const n = toNumber(value);
  if (n === null) return '–';
  if (unit === 'percent') return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
  if (unit === 'usd') {
    return Number.isInteger(n)
      ? `$${n.toLocaleString('en-US')}`
      : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

// Week-over-week movement. Returns null when there is no comparable baseline,
// so the caller renders nothing rather than a meaningless "+100%".
export function scorecardDelta(row) {
  const value = toNumber(row?.value);
  const prev = toNumber(row?.prev);
  if (value === null || prev === null) return null;
  if (prev === 0 && value === 0) return { dir: 'flat', label: '±0' };
  if (prev === 0) return { dir: 'up', label: `+${formatScorecardValue(value, row.unit)}` };
  const pct = Math.round(((value - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return { dir: 'flat', label: '±0%' };
  return { dir: pct > 0 ? 'up' : 'down', label: `${Math.abs(pct)}%` };
}

// Whether a delta is good news. For failed renewals (invert), down is good.
export function deltaIsGood(row, delta) {
  if (!delta || delta.dir === 'flat') return null;
  const rising = delta.dir === 'up';
  return row?.invert ? !rising : rising;
}

// Progress toward the 90-day target, 0..1. Inverted metrics are already at
// 100% while they sit at or below their ceiling.
export function scorecardPace(row) {
  const value = toNumber(row?.value);
  const target = toNumber(row?.target);
  if (value === null || target === null || target === 0) return null;
  if (row?.invert) {
    if (value <= target) return 1;
    return Math.max(0, Math.min(1, target / value));
  }
  return Math.max(0, Math.min(1, value / target));
}

export function scorecardOnTarget(row) {
  const value = toNumber(row?.value);
  const target = toNumber(row?.target);
  if (value === null || target === null) return null;
  return row?.invert ? value <= target : value >= target;
}

export function scorecardRows(scorecard) {
  const rows = Array.isArray(scorecard?.rows) ? scorecard.rows : [];
  const byKey = new Map(rows.map((row) => [row?.key, row]));
  return SCORECARD_KEYS.map((key) => byKey.get(key)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Email. Same table-based, dark-mode-aware idiom as the daily report, kept
// deliberately plain: eight rows, this week vs last week vs target.
// ---------------------------------------------------------------------------

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = {
  bg: '#eef1f6',
  card: '#fffffe',
  border: '#e3e8ef',
  navy: '#16304f',
  navyMuted: '#a8bcd6',
  accent: '#3f76c4',
  text: '#1c2a3a',
  muted: '#64748b',
  track: '#e9edf3',
  up: '#0f7b46',
  down: '#b3261e',
  flat: '#64748b',
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function scorecardWeekLabel(scorecard, now = Date.now()) {
  const to = scorecard?.to ? Date.parse(scorecard.to) : now;
  const end = Number.isFinite(to) ? to : now;
  const start = scorecard?.from ? Date.parse(scorecard.from) : end - 7 * 864e5;
  const fmt = (ms) =>
    new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(Number.isFinite(start) ? start : end - 7 * 864e5)} – ${fmt(end)} · UTC`;
}

export function scorecardSubject(scorecard) {
  const rows = scorecardRows(scorecard);
  const visitors = rows.find((row) => row.key === 'visitors_per_day');
  const mrr = rows.find((row) => row.key === 'mrr_usd');
  const hits = rows.filter((row) => scorecardOnTarget(row) === true).length;
  return `IELTS Bank Monday scorecard: ${formatScorecardValue(visitors?.value, 'number')} visitors/day, ${formatScorecardValue(mrr?.value, 'usd')} MRR, ${hits}/${rows.length} on target`;
}

function deltaCell(row) {
  const delta = scorecardDelta(row);
  if (!delta) return `<span style="color:${C.muted};">no baseline</span>`;
  const good = deltaIsGood(row, delta);
  const color = good === null ? C.flat : good ? C.up : C.down;
  const arrow = delta.dir === 'up' ? '&#9650;' : delta.dir === 'down' ? '&#9660;' : '';
  return `<span style="color:${color};font-weight:600;">${arrow} ${esc(delta.label)}</span>`;
}

export function renderScorecardEmail(scorecard) {
  const rows = scorecardRows(scorecard);
  const onTarget = rows.filter((row) => scorecardOnTarget(row) === true).length;
  const body = rows
    .map((row) => {
      const hit = scorecardOnTarget(row);
      const pace = scorecardPace(row);
      const width = pace === null ? 0 : Math.max(2, Math.round(pace * 100));
      return `<tr>
      <td class="em-txt" style="font-size:13px;color:${C.text};padding:9px 8px 9px 0;line-height:1.35;">
        ${esc(row.label)}
        <div class="em-track" style="background-color:${C.track};border-radius:4px;margin-top:5px;height:6px;">
          <div style="background-color:${hit ? C.up : C.accent};width:${width}%;height:6px;border-radius:4px;font-size:1px;line-height:1px;">&nbsp;</div>
        </div>
      </td>
      <td class="em-txt" style="font-size:15px;font-weight:700;color:${C.text};padding:9px 8px;text-align:right;white-space:nowrap;">
        ${esc(formatScorecardValue(row.value, row.unit))}
      </td>
      <td class="em-muted" style="font-size:12px;color:${C.muted};padding:9px 8px;text-align:right;white-space:nowrap;">
        ${esc(formatScorecardValue(row.prev, row.unit))}
      </td>
      <td style="font-size:12px;padding:9px 8px;text-align:right;white-space:nowrap;">${deltaCell(row)}</td>
      <td class="em-muted" style="font-size:12px;color:${C.muted};padding:9px 0;text-align:right;white-space:nowrap;">
        ${esc(formatScorecardValue(row.target, row.unit))}${hit ? ' &#10003;' : ''}
      </td>
    </tr>`;
    })
    .join('');

  const preheader = `${onTarget} of ${rows.length} targets met · ${esc(scorecardWeekLabel(scorecard))}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .em-body { background-color: #131313 !important; }
  .em-card { background-color: #1e1f22 !important; border-color: #33363c !important; }
  .em-txt { color: #f0f2f5 !important; }
  .em-muted { color: #9aa4b2 !important; }
  .em-track { background-color: #33363c !important; }
}
[data-ogsc] .em-txt { color: #f0f2f5 !important; }
[data-ogsb] .em-card { background-color: #1e1f22 !important; }
</style>
</head>
<body class="em-body" style="margin:0;padding:0;background-color:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-body" style="background-color:${C.bg};"><tr><td align="center" style="padding:20px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:${FONT};">
<tr><td style="background-color:${C.navy};border-radius:12px;padding:18px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-size:17px;font-weight:700;color:#fffffe;">IELTS Bank</td>
    <td style="font-size:12px;color:${C.navyMuted};text-align:right;">Monday scorecard</td>
  </tr></table>
  <div style="font-size:13px;color:${C.navyMuted};padding-top:2px;">${esc(scorecardWeekLabel(scorecard))} &middot; ${onTarget}/${rows.length} on target</div>
</td></tr>
<tr><td><div style="height:14px;line-height:14px;font-size:1px;">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-card" style="background-color:${C.card};border:1px solid ${C.border};border-radius:12px;"><tr><td style="padding:18px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr class="em-muted" style="color:${C.muted};">
    <td style="font-size:11px;letter-spacing:1px;font-weight:700;text-transform:uppercase;padding-bottom:6px;">Metric</td>
    <td style="font-size:11px;letter-spacing:1px;font-weight:700;text-transform:uppercase;padding-bottom:6px;text-align:right;">This week</td>
    <td style="font-size:11px;letter-spacing:1px;font-weight:700;text-transform:uppercase;padding-bottom:6px;text-align:right;">Last week</td>
    <td style="font-size:11px;letter-spacing:1px;font-weight:700;text-transform:uppercase;padding-bottom:6px;text-align:right;">Move</td>
    <td style="font-size:11px;letter-spacing:1px;font-weight:700;text-transform:uppercase;padding-bottom:6px;text-align:right;">Target</td>
  </tr>
  ${body}
</table>
</td></tr></table>
<div class="em-muted" style="font-size:12px;color:${C.muted};text-align:center;padding:8px 0 20px;">
  <a href="https://www.ielts-bank.com/data" style="color:${C.accent};text-decoration:none;font-weight:600;">Open /data</a>
  &nbsp;&middot;&nbsp; Automated Monday scorecard
</div>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}
