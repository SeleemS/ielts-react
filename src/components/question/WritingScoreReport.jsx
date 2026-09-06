import * as React from 'react';
import NextLink from 'next/link';
import { Lock } from 'lucide-react';
import ExamPassOffer from '../ExamPassOffer';
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

// Shaped, content-free placeholder for paid report sections. The bars are
// empty divs — there is no real text under the blur to reveal, because the
// withheld strings never leave the server (see reduceForFree in the writing
// route). The blur + lock exist to show the SHAPE of what Pro adds.
function MaskedLines({ widths }) {
  return (
    <div
      aria-hidden="true"
      className="select-none space-y-2 blur-[3px] [filter:blur(3px)]"
    >
      {widths.map((width, index) => (
        <div
          key={index}
          className="h-3 rounded bg-muted-foreground/25"
          style={{ width }}
        />
      ))}
    </div>
  );
}

function MaskedCorrection() {
  return (
    <div className="rounded-md border border-border/70 bg-secondary/30 p-3">
      <MaskedLines widths={['92%', '61%']} />
    </div>
  );
}

function hasBand(criterion) {
  return typeof criterion?.band === 'number';
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
  const rewrite = result.rewrite && typeof result.rewrite === 'object' ? result.rewrite : null;
  const isTeaser = result.free === true && !sample;
  // How many corrections the API held back. The free payload ships exactly one
  // real correction plus this count — never the withheld text.
  const lockedCorrections = Number.isFinite(result.lockedCorrectionCount)
    ? Math.max(0, result.lockedCorrectionCount)
    : 0;
  // Show the real number of withheld corrections, capped so the block stays a
  // preview rather than a wall; at least two when the source sent no count.
  const maskedCorrectionCount = Math.min(Math.max(lockedCorrections, 2), 3);
  // The Band Estimator's free reveal still withholds criteria 2-4, so the
  // upgrade copy must not claim all four bands are visible there.
  const visibleCriteria = criteriaMeta.filter(([key]) => hasBand(criteria[key] || {})).length;
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
    track('pro_preview_shown', {
      source: analyticsSource,
      skill: 'writing',
      band: result.overallBand,
      corrections_shown: corrected.length,
      corrections_locked: lockedCorrections,
      rewrite_locked: result.rewriteLocked === true,
    });
  }, [
    analyticsSource,
    corrected.length,
    isTeaser,
    lockedCorrections,
    result.overallBand,
    result.rewriteLocked,
  ]);

  return (
    <div className="space-y-5">
      <BandHero
        band={result.overallBand}
        subtitle={
          sourceLabel || `Writing Task ${task}${result.wordCount ? ` · ${result.wordCount} words` : ''}`
        }
      />

      <div className="space-y-3">
        {criteriaMeta.map(([key, label]) => {
          const criterion = criteria[key] || {};
          // Free reports now keep ALL FOUR criterion bands (see reduceForFree
          // in the writing route). A criterion with no band means the source
          // withheld it — the Band Estimator's free reveal still sends only
          // the first — so it stays a locked placeholder there.
          if (isTeaser && !hasBand(criterion)) {
            return <LockedPlaceholder key={key} label={label} />;
          }
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
        <>
          <LockedPlaceholder
            label="Examiner summary & improvement plan"
            hint={`Unlock Pro for the examiner summary and a prioritised plan to raise your band on your next ${submissionLabel}.`}
          />

          {/* Pro preview: one real correction in the clear, then shaped
              placeholders. The withheld text is never sent to the browser, so
              there is nothing behind the blur to un-blur. */}
          <div className="rounded-lg border border-primary/25 bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-foreground">Corrected examples</h3>
              {lockedCorrections > 0 ? (
                <span className="text-xs font-semibold text-muted-foreground">
                  1 of {lockedCorrections + 1} shown
                </span>
              ) : null}
            </div>
            {corrected.length > 0 ? (
              <div className="rounded-md border border-border/70 bg-secondary/30 p-3">
                <p className="text-sm text-destructive line-through decoration-destructive/50">
                  {corrected[0].original}
                </p>
                <p className="mt-1 text-sm font-medium text-accent">
                  {corrected[0].suggestion}
                </p>
              </div>
            ) : null}
            <div className="mt-3 space-y-3">
              {Array.from({ length: maskedCorrectionCount }).map((_, index) => (
                <MaskedCorrection key={index} />
              ))}
            </div>

            {result.rewriteLocked ? (
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="mb-2 text-sm font-bold text-foreground">
                  Band 8 rewrite of your weakest paragraph
                </h3>
                <MaskedLines widths={['97%', '100%', '88%', '94%', '52%']} />
              </div>
            ) : null}


          </div>
        </>
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

          {rewrite?.text ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-bold text-foreground">
                Band 8 rewrite of your weakest paragraph
              </h3>
              {rewrite.focus ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{rewrite.focus}</p>
              ) : null}
              <p className="mt-2 text-sm leading-relaxed text-foreground">{rewrite.text}</p>
            </div>
          ) : null}

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
        <ExamPassOffer skill="writing" source={analyticsSource} band={result.overallBand}>
          {visibleCriteria >= criteriaMeta.length
            ? `You’ve seen your band on all four criteria${corrected.length ? ' and one real correction' : ''}.`
            : 'You’ve seen your overall band and your first criterion.'}
        </ExamPassOffer>
      ) : null}
      {!sample && typeof result.overallBand === 'number' ? (
        <ShareRow
          source="writing_report"
          path={`/r?band=${formatBand(result.overallBand)}&skill=writing`}
          text={`My IELTS Writing ${submissionLabel} scored Band ${formatBand(result.overallBand)} with AI examiner feedback — try it free at IELTS-Bank`}
        />
      ) : null}
      {!sample && !isTeaser ? (
        // Testimonial collection loop: the pricing page's testimonial section
        // deliberately ships empty until real quotes exist — this is where
        // they come from. Routes into the existing rate-limited contact form.
        <p className="text-center text-xs text-muted-foreground">
          Did this feedback help?{' '}
          <NextLink
            href="/contactus?topic=feedback-story"
            onClick={() => track('testimonial_prompt_click', { source: analyticsSource })}
            className="font-semibold text-accent"
          >
            Tell us in a sentence
          </NextLink>{' '}
          — with your permission we may feature it.
        </p>
      ) : null}
    </div>
  );
}
