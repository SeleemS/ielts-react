import * as React from 'react';
import { T, fmtNum } from './theme';

const WEEK_TARGET_PCT = 20;

function weekLabel(week) {
  const ms = Date.parse(`${week}T00:00:00Z`);
  if (!Number.isFinite(ms)) return week;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Week-2 return rate: of the people who verified a sign-up in a given week, how
// many came back on days 8-14. Cohorts younger than 21 days cannot be measured
// yet, and are drawn as an empty slot rather than a number that can only rise.
export default function RetentionCard({ retention }) {
  const weeks = Array.isArray(retention?.weeks) ? retention.weeks : [];
  const current = retention?.current || null;
  const latest = retention?.latest || null;
  const pending = weeks.filter((week) => !week.measurable).length;

  if (!weeks.length) {
    return (
      <div className="flex h-24 items-center justify-center text-[12px]" style={{ color: T.faint }}>
        No sign-up cohorts yet
      </div>
    );
  }

  const measured = weeks.filter((week) => week.measurable);
  const maxPct = Math.max(WEEK_TARGET_PCT, ...measured.map((week) => Number(week.week2_pct) || 0));
  const currentPct = current ? Number(current.week2_pct) : null;

  return (
    <div>
      <div className="flex items-end gap-3">
        <span className="text-[27px] font-bold leading-9 tracking-tight" style={{ color: T.ink }}>
          {current && currentPct != null ? `${currentPct}%` : '–'}
        </span>
        <span className="pb-1.5 text-[11px]" style={{ color: T.faint }}>
          {current
            ? `week of ${weekLabel(current.week)} · ${fmtNum(current.signups)} sign-ups · ${fmtNum(current.week2)} came back`
            : 'no cohort has finished its 14 days yet'}
        </span>
      </div>
      {current ? (
        <div className="mt-0.5 text-[11px]" style={{ color: T.faint }}>
          {Number(current.week1_pct) || 0}% returned in week 1 · target {WEEK_TARGET_PCT}%
        </div>
      ) : null}

      <div className="mt-3 flex items-end gap-1.5" style={{ height: 86 }}>
        {weeks.map((week) => {
          const pct = Number(week.week2_pct) || 0;
          const height = week.measurable ? Math.max(3, Math.round((pct / maxPct) * 68)) : 0;
          const isCurrent = current && week.week === current.week;
          return (
            <div key={week.week} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              {week.measurable ? (
                <span className="text-[9px] tabular-nums" style={{ color: isCurrent ? T.ink : T.faint }}>
                  {pct}%
                </span>
              ) : (
                <span className="text-[9px]" style={{ color: T.faint }}>
                  ·
                </span>
              )}
              <div
                className="w-full rounded-sm"
                title={
                  week.measurable
                    ? `Week of ${weekLabel(week.week)} — ${week.week2}/${week.signups} back on days 8–14`
                    : `Week of ${weekLabel(week.week)} — ${week.signups} sign-ups, too young to measure`
                }
                style={{
                  height: week.measurable ? height : 68,
                  background: week.measurable
                    ? isCurrent
                      ? T.line
                      : T.barVisitors
                    : 'repeating-linear-gradient(45deg, rgba(139,147,161,0.10) 0 4px, transparent 4px 8px)',
                  border: week.measurable ? 'none' : `1px dashed ${T.divider}`,
                }}
              />
              <span className="w-full truncate text-center text-[9px]" style={{ color: T.faint }}>
                {weekLabel(week.week)}
              </span>
            </div>
          );
        })}
      </div>

      {pending > 0 ? (
        <div className="mt-2 text-[11px]" style={{ color: T.faint }}>
          {pending === 1 ? '1 cohort is' : `${pending} cohorts are`} still inside the 14-day window
          {latest && !latest.measurable ? ` (newest: ${fmtNum(latest.signups)} sign-ups, week of ${weekLabel(latest.week)})` : ''}.
        </div>
      ) : null}
    </div>
  );
}
