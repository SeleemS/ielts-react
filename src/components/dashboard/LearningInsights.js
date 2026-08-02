import * as React from 'react';
import NextLink from 'next/link';
import { ArrowRight, BrainCircuit, CalendarDays, CheckCircle2, RotateCcw, Target } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Progress } from '../../../components/ui/progress';
import { SKILL_META, formatBand, prettyQuestionType } from './utils';

const CRITERIA_LABELS = {
  taskResponse: 'Task response',
  taskAchievement: 'Task achievement',
  task_response: 'Task response',
  task_achievement: 'Task achievement',
  coherenceCohesion: 'Coherence & cohesion',
  coherence_cohesion: 'Coherence & cohesion',
  lexicalResource: 'Lexical resource',
  lexical_resource: 'Lexical resource',
  grammaticalRange: 'Grammar range',
  grammatical_range: 'Grammar range',
  fluencyCoherence: 'Fluency & coherence',
  fluency_coherence: 'Fluency & coherence',
  pronunciation: 'Pronunciation',
};

function ActivityCalendar({ activity }) {
  const max = Math.max(1, ...activity.map((day) => day.count));
  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-1.5" aria-label="Practice activity over the last 28 days">
        {activity.map((day) => {
          const level = day.count === 0 ? 0 : Math.max(1, Math.ceil((day.count / max) * 4));
          const colors = ['bg-slate-100', 'bg-emerald-200', 'bg-emerald-300', 'bg-emerald-500', 'bg-emerald-700'];
          return (
            <span
              key={day.key}
              className={`aspect-square min-h-4 rounded-[5px] ${colors[level]}`}
              title={`${day.date.toLocaleDateString()}: ${day.count} submission${day.count === 1 ? '' : 's'}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
        <span>4 weeks ago</span>
        <span className="flex items-center gap-1">Less <i className="h-2.5 w-2.5 rounded-sm bg-slate-100" /><i className="h-2.5 w-2.5 rounded-sm bg-emerald-300" /><i className="h-2.5 w-2.5 rounded-sm bg-emerald-700" /> More</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function PracticePlan({ data, targetBand }) {
  const recommended = SKILL_META[data.recommendedSkill];
  const current = data.skills[data.recommendedSkill].latest;
  const gap = current !== null && targetBand !== null ? Math.max(0, targetBand - current) : null;
  const tasks = [
    {
      title: `Complete one ${recommended.label} set`,
      body: current === null ? 'Create your first baseline score.' : gap > 0 ? `Close the ${gap.toFixed(1)} band gap with targeted practice.` : 'Maintain this score with one focused set.',
      href: recommended.href,
    },
    data.mistakes[0]
      ? { title: 'Retry your oldest weak spot', body: `${data.mistakes[0].wrong} answer${data.mistakes[0].wrong === 1 ? '' : 's'} to revisit.`, href: data.mistakes[0].href }
      : { title: 'Build your question-type profile', body: 'Submit an auto-scored set to unlock weakness analysis.', href: '/readingquestion' },
    {
      title: 'Practise on consecutive days',
      body: data.streak ? `You are on a ${data.streak}-day streak. Keep it alive.` : 'A short daily session is enough to start.',
      href: recommended.href,
    },
  ];

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_55px_-38px_rgba(15,23,42,0.5)] sm:p-7" aria-labelledby="plan-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Your next moves</p>
          <h2 id="plan-heading" className="mt-2 text-xl font-black tracking-tight text-slate-950">Personal practice plan</h2>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <BrainCircuit className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-6 space-y-3">
        {tasks.map((task, index) => (
          <NextLink
            key={task.title}
            href={task.href || recommended.href}
            className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 no-underline transition hover:border-emerald-200 hover:bg-emerald-50/50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-slate-700 shadow-sm ring-1 ring-slate-200">{index + 1}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{task.title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{task.body}</span></span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-emerald-700" />
          </NextLink>
        ))}
      </div>
    </section>
  );
}

function AccuracyPanel({ data }) {
  const rows = data.typeAccuracy.slice(0, 6);
  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_55px_-38px_rgba(15,23,42,0.5)] sm:p-7" aria-labelledby="accuracy-heading">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Accuracy signals</p><h2 id="accuracy-heading" className="mt-2 text-xl font-black tracking-tight text-slate-950">Question-type mastery</h2></div>
        <Target className="h-5 w-5 text-violet-600" />
      </div>
      {rows.length ? (
        <div className="mt-6 space-y-4">
          {rows.map((item) => (
            <div key={item.type}>
              <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-semibold text-slate-700">{prettyQuestionType(item.type)}</span>
                <span className="shrink-0 font-bold tabular-nums text-slate-500">{item.percentage}% · {item.correct}/{item.total}</span>
              </div>
              <Progress value={item.percentage} className="h-2 bg-slate-100" indicatorClassName={item.percentage < 60 ? 'bg-amber-500' : 'bg-emerald-500'} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">Accuracy insights are waiting</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Submit Reading or Listening practice to reveal your strongest and weakest question types.</p>
        </div>
      )}
    </section>
  );
}

function CriteriaPanel({ criteria }) {
  const rows = Object.entries(criteria)
    .map(([key, values]) => ({ key, latest: values.at(-1), previous: values.at(-2) }))
    .sort((a, b) => a.latest - b.latest)
    .slice(0, 6);
  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-7" aria-labelledby="criteria-heading">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">AI feedback trends</p><h2 id="criteria-heading" className="mt-2 text-xl font-black tracking-tight text-slate-950">Writing & speaking criteria</h2></div>
      {rows.length ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const delta = row.previous == null ? null : row.latest - row.previous;
            return (
              <div key={row.key} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                <p className="truncate text-xs font-medium text-slate-500">{CRITERIA_LABELS[row.key] || prettyQuestionType(row.key)}</p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <p className="text-2xl font-black text-slate-950">{formatBand(row.latest)}</p>
                  {delta !== null && <span className={`text-xs font-bold ${delta >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm leading-6 text-slate-500">Your criterion-level Writing and Speaking patterns will appear after AI-scored practice.</p>
      )}
    </section>
  );
}

function MistakesPanel({ mistakes }) {
  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-7" aria-labelledby="mistakes-heading">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Revision queue</p><h2 id="mistakes-heading" className="mt-2 text-xl font-black tracking-tight text-slate-950">Mistakes worth revisiting</h2></div>
        <RotateCcw className="h-5 w-5 text-amber-600" />
      </div>
      {mistakes.length ? (
        <>
          <ul className="mt-5 divide-y divide-slate-100">
            {mistakes.slice(0, 4).map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><RotateCcw className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{item.title}</p><p className="mt-0.5 text-xs capitalize text-slate-500">{item.skill} · {item.wrong} incorrect</p></div>
                <Button asChild size="sm" variant="outline">
                  <NextLink href={item.slug ? `/review?passage=${encodeURIComponent(item.slug)}` : '/review'}>
                    Review
                  </NextLink>
                </Button>
              </li>
            ))}
          </ul>
          <Button asChild variant="accent" size="sm" className="mt-4 w-full">
            <NextLink href="/review" className="no-underline">Review all my mistakes</NextLink>
          </Button>
        </>
      ) : (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" /><p className="text-sm font-semibold">No recorded mistakes yet. Keep practising to build your revision queue.</p>
        </div>
      )}
    </section>
  );
}

export default function LearningInsights({ data, targetBand }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <PracticePlan data={data} targetBand={targetBand} />
        <AccuracyPanel data={data} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_55px_-38px_rgba(15,23,42,0.5)] sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Consistency</p><h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">28-day practice rhythm</h2></div>
            <span className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600"><CalendarDays className="h-4 w-4" /> {data.activeDays} active days</span>
          </div>
          <ActivityCalendar activity={data.activity} />
        </div>
        <MistakesPanel mistakes={data.mistakes} />
      </div>
      <CriteriaPanel criteria={data.criteria} />
    </div>
  );
}
