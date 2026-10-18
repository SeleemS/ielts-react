import * as React from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { BandHero, BandMeter } from './question/ScoreUI';

// One static, clearly-labelled example of a full Pro Writing report, with every
// section tagged "Free sample" or "Pro" so a visitor can see exactly what the
// free report contains and what paying adds BEFORE they write an essay.
//
// It is fictional (never a learner's result, never a promised score) and it
// mirrors what the API really returns: the free payload keeps the overall band,
// the FIRST criterion (band + feedback) and ONE corrected sentence
// (reduceForFree in lib/writingReport.js); Pro adds the other three criteria,
// the examiner summary, the improvement plan, every correction and the Band 8
// paragraph rewrite.
export const SAMPLE_REPORT = {
  overallBand: 6.5,
  task: 2,
  wordCount: 268,
  prompt:
    'Some people think working from home benefits employees, while others believe offices are more productive. Discuss both views and give your opinion.',
  criteria: [
    {
      key: 'taskResponse',
      label: 'Task Response',
      band: 6.5,
      strength: 'Your position is clear from the introduction and kept to the end.',
      fix: 'The commuting idea is asserted, not developed — add a specific consequence.',
    },
    {
      key: 'coherenceCohesion',
      label: 'Coherence & Cohesion',
      band: 7,
      strength: 'Each paragraph has one central idea and a logical order.',
      fix: 'Three paragraphs open with “Furthermore” — vary how ideas are linked.',
    },
    {
      key: 'lexicalResource',
      label: 'Lexical Resource',
      band: 6,
      strength: 'Accurate topic vocabulary such as “commute” and “flexibility”.',
      fix: '“Important” appears five times, and “do a decision” is a collocation error.',
    },
    {
      key: 'grammaticalRange',
      label: 'Grammatical Range & Accuracy',
      band: 6.5,
      strength: 'A useful mix of simple and complex sentences.',
      fix: 'Article and plural slips (“the number of remote worker”) recur in longer sentences.',
    },
  ],
  corrections: [
    {
      original: 'People can do a decision about their work.',
      suggestion: 'People can make an informed decision about their work.',
    },
    {
      original: 'In the last decade, the number of remote worker increase.',
      suggestion: 'Over the last decade, the number of remote workers has increased.',
    },
    {
      original: 'It is important for the companies to give flexibility.',
      suggestion: 'Companies should offer flexible working arrangements.',
    },
  ],
  summary:
    'A well-organised response with a clear position. Ideas are relevant but thinly supported, and repeated vocabulary holds Lexical Resource at 6. Specific examples and more precise word choice would move this essay toward Band 7.',
  plan: [
    'Lexical Resource first: replace repeated “important” with precise alternatives and fix collocations.',
    'Task Response: give every main idea one concrete example and its consequence.',
    'Grammar: proofread articles and plurals in sentences longer than 20 words.',
  ],
  rewrite: {
    focus: 'Your second body paragraph — the weakest for Task Response.',
    before:
      'Working from home is good because people do not need to commute. This is important for the workers and it is important for the environment too.',
    after:
      'Remote work also removes the daily commute. An employee who no longer spends two hours in traffic gains time for rest or study, and fewer cars on the road means lower emissions in congested cities.',
  },
};

function formatBand(band) {
  return typeof band === 'number' ? band.toFixed(1) : '—';
}

export function TierTag({ tier, className }) {
  if (tier === 'pro') {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary-foreground',
          className
        )}
      >
        <Lock className="h-3 w-3" aria-hidden="true" />
        Pro
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent',
        className
      )}
    >
      Free sample
    </span>
  );
}

function Section({ tier, title, children, testId }) {
  return (
    <div
      data-testid={testId}
      data-tier={tier}
      className={cn(
        'rounded-lg border bg-card p-4',
        tier === 'pro' ? 'border-primary/25 border-l-4 border-l-primary' : 'border-border'
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <TierTag tier={tier} />
      </div>
      {children}
    </div>
  );
}

function Correction({ original, suggestion }) {
  return (
    <div className="rounded-md border border-border/70 bg-secondary/30 p-3">
      <p className="text-sm text-destructive line-through decoration-destructive/50">{original}</p>
      <p className="mt-1 text-sm font-medium text-accent">{suggestion}</p>
    </div>
  );
}

// `children` renders under the report — pages pass their own CTA so the
// homepage can say "check my essay" while the pricing page scrolls to plans.
export default function SampleReportPreview({
  id = 'sample-report',
  title = 'See exactly what a report looks like',
  intro,
  className,
  children,
}) {
  const r = SAMPLE_REPORT;
  const [firstCorrection, ...moreCorrections] = r.corrections;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('scroll-mt-28', className)}>
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Sample report</p>
        <h2 id={`${id}-title`} className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {intro ||
            'An illustrative Task 2 report — not a real learner’s result or a promised score. Your first report is free; Pro adds the sections marked Pro to every essay you score after that.'}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <TierTag tier="free" /> included in your free report
          </span>
          <span className="inline-flex items-center gap-1.5">
            <TierTag tier="pro" /> added by Pro
          </span>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-3xl space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div data-testid="sample-overall" data-tier="free">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <h3 className="text-sm font-bold text-foreground">Overall band estimate</h3>
            <TierTag tier="free" />
          </div>
          <BandHero band={r.overallBand} subtitle={`Writing Task ${r.task} · ${r.wordCount} words`} />
        </div>

        <Section tier="free" title={`Band and feedback on ${r.criteria[0].label}`} testId="sample-criteria">
          <ul className="space-y-3">
            {r.criteria.slice(0, 1).map((c) => (
              <li key={c.key}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">{c.label}</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">{formatBand(c.band)}</span>
                </div>
                <div className="mt-1.5">
                  <BandMeter band={c.band} />
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  <span className="font-semibold text-accent">Strength:</span> {c.strength}{' '}
                  <span className="font-semibold text-foreground">Fix:</span> {c.fix}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section tier="pro" title="Band and feedback on the other three criteria" testId="sample-criteria-pro">
          <ul className="space-y-3">
            {r.criteria.slice(1).map((c) => (
              <li key={c.key}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">{c.label}</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">{formatBand(c.band)}</span>
                </div>
                <div className="mt-1.5">
                  <BandMeter band={c.band} />
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  <span className="font-semibold text-accent">Strength:</span> {c.strength}{' '}
                  <span className="font-semibold text-foreground">Fix:</span> {c.fix}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section tier="free" title="One corrected sentence from your essay" testId="sample-first-correction">
          <Correction {...firstCorrection} />
        </Section>

        <Section tier="pro" title="Examiner summary" testId="sample-summary">
          <p className="text-sm leading-6 text-muted-foreground">{r.summary}</p>
        </Section>

        <Section tier="pro" title="Your improvement plan, in priority order" testId="sample-plan">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
            {r.plan.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Section>

        <Section
          tier="pro"
          title={`Every corrected sentence (${r.corrections.length} in this essay)`}
          testId="sample-all-corrections"
        >
          <div className="space-y-2">
            {moreCorrections.map((c) => (
              <Correction key={c.original} {...c} />
            ))}
          </div>
        </Section>

        <Section tier="pro" title="Band 8 rewrite of your weakest paragraph" testId="sample-rewrite">
          <p className="text-xs text-muted-foreground">{r.rewrite.focus}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-secondary/50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Your paragraph</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{r.rewrite.before}</p>
            </div>
            <div className="rounded-md bg-accent/10 p-3">
              <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-accent">
                <Sparkles className="h-3 w-3" aria-hidden="true" /> Band 8 version
              </p>
              <p className="mt-1 text-sm leading-6 text-foreground">{r.rewrite.after}</p>
            </div>
          </div>
        </Section>

        {children ? <div className="pt-2">{children}</div> : null}
      </div>
    </section>
  );
}
