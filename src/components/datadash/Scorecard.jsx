import * as React from 'react';
import { T } from './theme';
import {
  formatScorecardValue,
  scorecardDelta,
  deltaIsGood,
  scorecardOnTarget,
  scorecardPace,
  scorecardRows,
} from '../../../lib/weeklyScorecard';

// Monday scorecard: the eight distribution metrics, last 7 days vs the prior 7,
// each against its 90-day target. Same rows, formatting and target logic as the
// Monday email (lib/weeklyScorecard.js) — this card is the email on screen.
// Plain rows and a progress track, in the existing DataFast language: no tabs,
// no overlays, nothing to click through.
export default function Scorecard({ scorecard }) {
  const rows = scorecardRows(scorecard);
  if (!rows.length) {
    return (
      <div className="flex h-24 items-center justify-center text-[12px]" style={{ color: T.faint }}>
        Scorecard unavailable
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left" style={{ color: T.faint }}>
            <th className="py-1.5 pr-2 font-semibold">Metric</th>
            <th className="py-1.5 pr-2 text-right font-semibold">This week</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Last week</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Move</th>
            <th className="py-1.5 text-right font-semibold">Target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const delta = scorecardDelta(row);
            const good = deltaIsGood(row, delta);
            const hit = scorecardOnTarget(row);
            const pace = scorecardPace(row);
            return (
              <tr key={row.key} className="border-t" style={{ borderColor: T.divider }}>
                <td className="min-w-[190px] py-2 pr-2">
                  <div style={{ color: T.muted }}>{row.label}</div>
                  <div className="mt-1 h-[5px] overflow-hidden rounded-full" style={{ background: T.panelHover }}>
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${Math.max(2, Math.round((pace ?? 0) * 100))}%`,
                        background: hit ? T.up : T.line,
                      }}
                    />
                  </div>
                </td>
                <td
                  className="py-2 pr-2 text-right align-top text-[15px] font-bold tabular-nums"
                  style={{ color: T.ink }}
                >
                  {formatScorecardValue(row.value, row.unit)}
                </td>
                <td className="py-2 pr-2 text-right align-top tabular-nums" style={{ color: T.muted }}>
                  {formatScorecardValue(row.prev, row.unit)}
                </td>
                <td className="py-2 pr-2 text-right align-top font-semibold tabular-nums">
                  {delta ? (
                    <span style={{ color: good === null ? T.faint : good ? T.up : T.down }}>
                      {delta.dir === 'up' ? '↑' : delta.dir === 'down' ? '↓' : ''} {delta.label}
                    </span>
                  ) : (
                    <span style={{ color: T.faint }}>–</span>
                  )}
                </td>
                <td className="py-2 text-right align-top tabular-nums" style={{ color: hit ? T.up : T.faint }}>
                  {formatScorecardValue(row.target, row.unit)}
                  {hit ? ' ✓' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
