import * as React from 'react';
import NextLink from 'next/link';
import { ArrowRight, Flame, Trophy } from 'lucide-react';
import { useStreak } from '../../lib/useStreak';

// Streak, front and centre at the top of the dashboard: current run, personal
// best, and — the whole point — whether today still needs a session. Same
// numbers as the navbar badge and the streak emails (src/lib/streak.js), all
// computed from the learner's own attempts.
//
// The flame pulses only for viewers who have not asked for reduced motion.
export default function StreakCard() {
  const { loading, streak, bestStreak, practicedToday } = useStreak();

  if (loading) {
    return (
      <div className="h-20 animate-pulse rounded-3xl border border-slate-200/80 bg-white" aria-hidden="true" />
    );
  }

  const best = Math.max(Number(bestStreak) || 0, streak);
  const headline = streak > 0
    ? `${streak}-day practice streak`
    : 'Start a practice streak today';
  const detail = streak > 0
    ? practicedToday
      ? 'Practised today — your streak is safe.'
      : 'Practise today to keep it.'
    : 'One 10-minute set today puts you on day 1.';

  return (
    <section
      aria-label="Practice streak"
      className="flex flex-col gap-4 rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex items-center gap-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 ${
            streak > 0 && !practicedToday ? 'motion-safe:animate-pulse' : ''
          }`}
        >
          <Flame className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-lg font-black tracking-tight text-slate-950">{headline}</p>
          <p className="mt-0.5 text-sm text-slate-600">{detail}</p>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <div className="text-center">
          <p className="text-2xl font-black tabular-nums text-slate-950">{streak}</p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Current</p>
        </div>
        <div className="text-center">
          <p className="flex items-center justify-center gap-1 text-2xl font-black tabular-nums text-slate-950">
            <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
            {best}
          </p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Best</p>
        </div>
        {!practicedToday && (
          <NextLink
            href="/review"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white no-underline transition hover:bg-slate-800"
          >
            Practise now <ArrowRight className="h-4 w-4" />
          </NextLink>
        )}
      </div>
    </section>
  );
}
