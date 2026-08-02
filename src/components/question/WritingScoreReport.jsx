import * as React from 'react';
import NextLink from 'next/link';
import { Lock, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../lib/utils';
import { track } from '../../lib/analytics';
import { BandHero, BandMeter, CriterionFeedback } from './ScoreUI';
import ShareRow from '../ShareRow';

const TASK2_CRITERIA = [
  ['taskResponse', 'Task Response'],
  ['coherenceCohesion', 'Coherence & Cohesion'],
  ['lexicalResource', 'Lexical Resource'],
  ['grammaticalRange', 'Grammatical Range & Accuracy'],
];
const TASK1_CRITERIA = [
  ['taskAchievement', 'Task Achievement'],
  ['coherenceCohesion', 'Coherence & Cohesion'],
  ['lexicalResource', 'Lexical Resource'],
  ['grammaticalRange', 'Grammatical Range & Accuracy'],
];

function formatBand(band) {
  return typeof band === 'number' ? band.toFixed(1) : '—';
}

function bandTone(band) {
  if (typeof band !== 'number') return 'bg-secondary text-secondary-foreground';
  if (band >= 7) return 'bg-accent text-accent-foreground';
  if (band >= 5.5) return 'bg-primary text-primary-foreground';
  return 'bg-destructive text-destructive-foreground';
}

function BandPill({ band }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[2.75rem] items-center justify-center rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums',
        bandTone(band)
      )}
    >
      {formatBand(band)}
    </span>
  );
}

// A locked criterion/section for free users. Renders NO real feedback — the
// paid content is withheld by the API (see reduceForFree in the writing route),
// so there is nothing here to reveal via DevTools. This replaces the old blurred
// overlay, which shipped the real text in the DOM.
function LockedPlaceholder({ label, hint }) {
  return (
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-foreground">{label}</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          <Lock className="h-3 w-3" aria-hidden="true" /> Premium
        </span>
      </div>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function issueCount(result) {
  const criterionIssues = Object.values(result.criteria || {}).reduce(
    (count, criterion) =>
      count + (Array.isArray(criterion?.improvements) ? criterion.improvements.length : 0),
    0
  );
  return (
    criterionIssues +
    (Array.isArray(result.improvements) ? result.improvements.length : 0) +
    (Array.isArray(result.correctedExamples) ? result.correctedExamples.length : 0)
  );
}

export default function WritingScoreReport({
  task,
  result,
  sample = false,
  sourceLabel,
  submissionLabel = 'essay',
  analyticsSource = 'score_tease',
}) {
  const criteriaMeta = task === 1 ? TASK1_CRITERIA : TASK2_CRITERIA;
  const criteria = result.criteria || {};
  const improvements = Array.isArray(result.improvements) ? result.improvements : [];
  const corrected = Array.isArray(result.correctedExamples)
    ? result.correctedExamples
    : [];
  const isTeaser = result.free === true && !sample;
  const trackedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isTeaser || trackedRef.current) return;
    trackedRef.current = true;
    track('premium_gate', {
      source: analyticsSource,
      stage: 'impression',
      skill: 'writing',
      band: result.overallBand,
    });
  }, [analyticsSource, isTeaser, result.overallBand]);

  return (
    <div className="space-y-5">
      <BandHero
        band={result.overallBand}
        subtitle={
          sourceLabel || `Writing Task ${task}${result.wordCount ? ` · ${result.wordCount} words` : ''}`
        }
      />

      <div className="space-y-3">
        {criteriaMeta.map(([key, label], index) => {
          if (isTeaser && index > 0) {
            return <LockedPlaceholder key={key} label={label} />;
          }
          const criterion = criteria[key] || {};
          return (
            <div key={key} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">{label}</h3>
                <BandPill band={criterion.band} />
              </div>
              <div className="mb-3">
                <BandMeter band={criterion.band} />
              </div>
              <CriterionFeedback criterion={criterion} />
            </div>
          );
        })}
      </div>

      {isTeaser ? (
        <LockedPlaceholder
          label="Examiner summary, improvement plan & corrected examples"
          hint={`Unlock Premium for the examiner summary, a prioritised plan to raise your band, and line-by-line corrected examples from your ${submissionLabel}.`}
        />
      ) : (
        <>
          {result.summary && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-1.5 text-sm font-bold text-foreground">Examiner Summary</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{result.summary}</p>
            </div>
          )}

          {improvements.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-2 text-sm font-bold text-foreground">How to Improve</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                {improvements.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {corrected.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-2 text-sm font-bold text-foreground">Corrected Examples</h3>
              <div className="space-y-3">
                {corrected.map((example, index) => (
                  <div key={index} className="rounded-md border border-border/70 bg-secondary/30 p-3">
                    <p className="text-sm text-destructive line-through decoration-destructive/50">
                      {example.original}
                    </p>
                    <p className="mt-1 text-sm font-medium text-accent">{example.suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {isTeaser ? (
        <div className="sticky bottom-3 z-10 rounded-xl border border-primary/25 bg-background/95 p-5 text-center shadow-xl backdrop-blur">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </span>
          <h3 className="mt-3 text-base font-bold text-foreground">
            Your Band {formatBand(result.overallBand)} {submissionLabel} has{' '}
            {result.lockedIssueCount ?? issueCount(result)} fixable issues
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            You&apos;ve seen your overall band and first criterion. Unlock the other three criteria,
            examiner summary, improvement plan, and corrected examples.
          </p>
          <Button asChild variant="accent" className="mt-4">
            <NextLink
              href="/pricing?upgrade=writing"
              onClick={() =>
                track('paywall_upgrade_click', {
                  source: analyticsSource,
                  skill: 'writing',
                  band: result.overallBand,
                })
              }
              className="no-underline"
            >
              <Sparkles className="h-4 w-4" />
              Unlock full feedback — Premium
            </NextLink>
          </Button>
        </div>
      ) : null}
      {!sample && typeof result.overallBand === 'number' ? (
        <ShareRow
          source="writing_report"
          path={`/r?band=${formatBand(result.overallBand)}&skill=writing`}
          text={`My IELTS Writing ${submissionLabel} scored Band ${formatBand(result.overallBand)} with AI examiner feedback — try it free at IELTS-Bank`}
        />
      ) : null}
    </div>
  );
}
