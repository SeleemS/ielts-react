import React from 'react';
import NextLink from 'next/link';
import { ArrowRight, BookOpen, Headphones, PenLine, Mic, RotateCcw, Target, Sparkles, Lock, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../lib/utils';
import { track, getAnonId } from '../../lib/analytics';
import { useAuth } from '../../lib/auth';
import { usePlan } from '../../lib/usePlan';
import { getSupabase } from '../../../lib/supabase';
import NewsletterSignup from '../NewsletterSignup';
import ShareRow from '../ShareRow';
import SignInDialog from '../auth/SignInDialog';
import { BandHero } from '../question/ScoreUI';
import WritingScoreReport from '../question/WritingScoreReport';
import { formatBand, overallEstimate } from './score';
import { ESTIMATOR_VERSION } from '../../../lib/estimatorConfig';
import { biggestGap } from './flow';
import { getSessionAccess } from '../../lib/sessionAccess';

// Target-band options mirror the onboarding chips in SignInDialog (~line 45).
const TARGET_BANDS = ['6.0', '6.5', '7.0', '7.5', '8.0+'];
const parseTarget = (label) => parseFloat(label); // '8.0+' -> 8

const SKILL_META = {
  reading: { label: 'Reading', icon: BookOpen, href: '/readingquestion' },
  listening: { label: 'Listening', icon: Headphones, href: '/listeningquestion' },
  writing: { label: 'Writing', icon: PenLine, href: '/writingquestion' },
  speaking: { label: 'Speaking', icon: Mic, href: '/speakingquestion' },
};

// A measured-skill card: authoritative point estimate + raw score.
function MeasuredCard({ skill, section, onPractice }) {
  const meta = SKILL_META[skill];
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-accent" /> {meta.label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tabular-nums text-foreground">
          ~{formatBand(section.band)}
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          {section.raw}/{section.total} correct
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Based on {section.total} real questions</p>
      <NextLink
        href={meta.href}
        onClick={onPractice}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent no-underline underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Practice {meta.label.toLowerCase()} <ArrowRight className="h-3 w-3" />
      </NextLink>
    </div>
  );
}

// A self-assessed card: deliberately LESS authoritative than the measured cards
// — dashed outline, hatched range bar, explicit "Self-assessed" tag.
function SelfAssessedCard({ skill, section }) {
  const meta = SKILL_META[skill];
  const Icon = meta.icon;
  const { min, max } = section.band;
  const leftPct = (min / 9) * 100;
  const widthPct = ((max - min) / 9) * 100;
  return (
    <div className="rounded-xl border border-dashed border-muted-foreground/40 bg-secondary/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" /> {meta.label}
        </div>
        <span className="rounded-full border border-muted-foreground/30 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Self-assessed
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
        likely {formatBand(min)}–{formatBand(max)}
      </div>
      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary"
        role="img"
        aria-label={`Estimated ${meta.label} band range ${formatBand(min)} to ${formatBand(max)}`}
      >
        <div
          className="h-full rounded-full border border-muted-foreground/50"
          style={{
            marginLeft: `${leftPct}%`,
            width: `${widthPct}%`,
            backgroundImage:
              'repeating-linear-gradient(45deg, hsl(var(--muted-foreground)/0.35) 0, hsl(var(--muted-foreground)/0.35) 3px, transparent 3px, transparent 6px)',
          }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Your estimate, not a measured score.</p>
    </div>
  );
}

// Writing WAS measured, but the band is withheld until the visitor creates a
// free account. Note this renders no band at all — there is nothing hidden in
// the DOM to un-blur, because the API never sent it.
function LockedWritingCard({ onUnlock, revealing, error }) {
  return (
    <div className="rounded-xl border border-dashed border-accent/50 bg-accent/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <PenLine className="h-4 w-4 text-accent" /> Writing
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
          <Lock className="h-3 w-3" /> Locked
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold text-muted-foreground">—</span>
        <span className="text-sm font-medium text-muted-foreground">marked &amp; waiting</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Your sample was marked against the official band descriptors.
      </p>
      <button
        type="button"
        onClick={onUnlock}
        disabled={revealing}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {revealing ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Unlocking…
          </>
        ) : (
          <>
            Unlock my Writing band <ArrowRight className="h-3 w-3" />
          </>
        )}
      </button>
      {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

// Writing after the reveal: a measured band, honestly labelled as indicative
// because it came from a ~100-word sample rather than a full essay.
function RevealedWritingCard({ band, wordCount, onPractice }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <PenLine className="h-4 w-4 text-accent" /> Writing
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tabular-nums text-foreground">~{formatBand(band)}</span>
        <span className="text-sm font-medium text-muted-foreground">indicative</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Marked from your {wordCount ? `${wordCount}-word` : 'short'} sample — a full essay gives a
        sharper band.
      </p>
      <NextLink
        href="/ielts-writing-checker"
        onClick={onPractice}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent no-underline underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Score a full essay <ArrowRight className="h-3 w-3" />
      </NextLink>
    </div>
  );
}

// What to actually DO next, driven by the weakest skill against the target.
const PLAN_BY_SKILL = {
  reading: {
    action: 'Drill the Reading question types that cost the most marks',
    detail: 'True/False/Not Given and Matching Headings are where most candidates lose Reading marks.',
    href: '/readingquestion',
    cta: 'Practise Reading',
  },
  listening: {
    action: 'Practise Listening with the transcript afterwards',
    detail: 'Answer first, then read the transcript to see exactly where the answer was signalled.',
    href: '/listeningquestion',
    cta: 'Practise Listening',
  },
  writing: {
    action: 'Get a full Task 2 essay marked',
    detail: 'A 250-word essay gives a precise band plus criterion-by-criterion feedback and corrections.',
    href: '/ielts-writing-checker',
    cta: 'Score an essay',
  },
  speaking: {
    action: 'Sit a live mock with the AI examiner',
    detail: 'Speaking only improves under real conditions — a full 3-part mock gives you a band.',
    href: '/speaking-examiner',
    cta: 'Meet the examiner',
  },
};

function StudyPlan({ worst, gap, targetBand, onCta }) {
  const focus = worst ? PLAN_BY_SKILL[worst.skill] : null;
  const steps = [
    focus
      ? { title: focus.action, body: focus.detail, href: focus.href, cta: focus.cta }
      : {
          title: 'Build your first full baseline',
          body: 'Measure every skill once so your plan can target the real weak spot.',
          href: '/readingquestion',
          cta: 'Start practising',
        },
    {
      title: 'Practise on consecutive days, not in one long session',
      body: 'Short daily sets beat cramming — and your dashboard tracks the streak.',
      href: '/dashboard',
      cta: 'Open dashboard',
    },
    {
      title: 'Confirm with a full 40-question mock',
      body: 'This 20-question snapshot points the direction; a timed mock gives the sharper number.',
      href: '/mock-test',
      cta: 'Take a mock',
    },
  ];

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-bold text-foreground">Your plan to reach {formatBand(targetBand)}</h3>
      </div>
      {worst ? (
        <p className="mt-1.5 text-sm text-muted-foreground">
          Start with <span className="font-semibold text-foreground">{SKILL_META[worst.skill].label}</span>
          {typeof gap === 'number' && gap > 0 ? ` — it's your biggest gap (${gap.toFixed(1)} bands).` : '.'}
        </p>
      ) : null}
      <ol className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{step.title}</div>
              <p className="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
              <NextLink
                href={step.href}
                onClick={onCta ? onCta(`plan_${index + 1}`) : undefined}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent no-underline underline-offset-4 hover:underline"
              >
                {step.cta} <ArrowRight className="h-3 w-3" />
              </NextLink>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// A skipped-skill card: honest "not measured" + practice link.
function SkippedCard({ skill, onPractice }) {
  const meta = SKILL_META[skill];
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="h-4 w-4" /> {meta.label}
      </div>
      <div className="mt-2 text-lg font-semibold text-muted-foreground">Not measured</div>
      <NextLink
        href={meta.href}
        onClick={onPractice}
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent no-underline underline-offset-4 hover:underline"
      >
        Practice {meta.label.toLowerCase()} to find out <ArrowRight className="h-3.5 w-3.5" />
      </NextLink>
    </div>
  );
}

// A conversion CTA row.
function CtaCard({ icon: Icon, title, body, actionLabel, href, onClick, tone = 'primary' }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between',
        tone === 'primary' ? 'border-accent/40 bg-accent/5' : 'border-border bg-card'
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            tone === 'primary' ? 'bg-accent/15 text-accent' : 'bg-secondary text-foreground'
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          <div className="text-sm font-bold text-foreground">{title}</div>
          {body ? <p className="mt-0.5 text-sm text-muted-foreground">{body}</p> : null}
        </div>
      </div>
      <Button asChild variant={tone === 'primary' ? 'accent' : 'outline'} className="shrink-0">
        <NextLink href={href} onClick={onClick}>
          {actionLabel} <ArrowRight className="h-4 w-4" />
        </NextLink>
      </Button>
    </div>
  );
}

export default function EstimatorResults({
  reading,
  listening,
  writing,
  speaking,
  overall,
  skipped = {},
  initialTargetBand = 7.0,
  onTargetBandChange,
  onWritingRevealed,
  onRetake,
}) {
  const { user } = useAuth();
  const { isPremium, loading: planLoading, error: planError } = usePlan();
  const signedIn = Boolean(user?.id);
  const [targetBand, setTargetBand] = React.useState(initialTargetBand);
  const [signInOpen, setSignInOpen] = React.useState(false);

  // The Writing sample was marked server-side and the band withheld. It can only
  // be read back by an authenticated call, which also files the sample into the
  // learner's history.
  const writingLocked = Boolean(writing && writing.locked);
  const [revealed, setRevealed] = React.useState(null);
  const [revealing, setRevealing] = React.useState(false);
  const [revealError, setRevealError] = React.useState('');

  const emit = React.useCallback(
    (event, params = {}) => {
      track(event, { version: ESTIMATOR_VERSION, signed_in: signedIn, ...params });
    },
    [signedIn]
  );

  const ctaClick = React.useCallback(
    (destination) => () => emit('estimator_cta_click', { destination }),
    [emit]
  );

  const reveal = React.useCallback(async () => {
    if (!signedIn || revealing) return;
    setRevealing(true);
    setRevealError('');
    try {
      const session = await getSessionAccess(getSupabase);
      if (session.error) {
        emit('estimator_writing_reveal_error', { code: 'auth_session' });
        setRevealError('Could not verify your session. Please refresh and try again.');
        return;
      }
      const response = await fetch('/api/estimator/reveal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session.accessToken
            ? { Authorization: `Bearer ${session.accessToken}` }
            : {}),
        },
        body: JSON.stringify({ anon_id: getAnonId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRevealError(body.error || 'Could not unlock your Writing band.');
        return;
      }
      const revealedOverall = overallEstimate({
        reading: reading?.band,
        listening: listening?.band,
        writing: body.band,
        speaking: speaking?.band,
      }).overall;
      setRevealed(body);
      onWritingRevealed?.({ band: body.band, overall: revealedOverall });
      emit('estimator_writing_revealed', { band: body.band });
    } catch {
      setRevealError('Could not unlock your Writing band. Please refresh and try again.');
    } finally {
      setRevealing(false);
    }
  }, [signedIn, revealing, emit, reading, listening, speaking, onWritingRevealed]);

  // Unlock automatically the moment a session exists — the visitor already
  // asked for this by creating the account.
  React.useEffect(() => {
    if (signedIn && writingLocked && !revealed && !revealing && !revealError) reveal();
  }, [signedIn, writingLocked, revealed, revealing, revealError, reveal]);

  const stillLocked = writingLocked && !revealed;
  const bands = {
    reading: reading ? reading.band : null,
    listening: listening ? listening.band : null,
    writing: revealed ? revealed.band : writing && !writing.locked ? writing.band : null,
    speaking: speaking ? speaking.band : null,
  };
  // The runner could not compute an overall while Writing was locked; once
  // revealed we can, so recompute here rather than showing a stale null.
  const effectiveOverall = stillLocked
    ? null
    : revealed
      ? overallEstimate({
          reading: bands.reading,
          listening: bands.listening,
          writing: bands.writing,
          speaking: bands.speaking,
        }).overall
      : overall;

  const measuredCount =
    (reading ? reading.total : 0) + (listening ? listening.total : 0);
  const writingMeasured = writingLocked || Boolean(revealed);
  const heroCaption =
    measuredCount > 0
      ? `Estimated from ${measuredCount} exam-style questions${
          writingMeasured ? ', a marked writing sample' : ''
        } and your self-assessment. Not an official score.`
      : 'Estimated from your self-assessment. Not an official score.';

  const handleTarget = (label) => {
    const value = parseTarget(label);
    setTargetBand(value);
    onTargetBandChange?.(value);
  };

  const gap =
    typeof effectiveOverall === 'number'
      ? Math.round((targetBand - effectiveOverall) * 10) / 10
      : null;
  const worst = biggestGap(bands, targetBand);

  const renderCard = (skill) => {
    if (skipped[skill]) {
      return <SkippedCard key={skill} skill={skill} onPractice={ctaClick(`practice_${skill}`)} />;
    }
    if (skill === 'reading' || skill === 'listening') {
      const section = skill === 'reading' ? reading : listening;
      if (!section) return <SkippedCard key={skill} skill={skill} onPractice={ctaClick(`practice_${skill}`)} />;
      return <MeasuredCard key={skill} skill={skill} section={section} onPractice={ctaClick(`practice_${skill}`)} />;
    }
    if (skill === 'writing') {
      if (stillLocked) {
        return (
          <LockedWritingCard
            key="writing"
            revealing={revealing}
            error={revealError}
            onUnlock={() => {
              emit('estimator_cta_click', { destination: 'unlock_writing' });
              if (signedIn) reveal();
              else setSignInOpen(true);
            }}
          />
        );
      }
      if (revealed) {
        return (
          <RevealedWritingCard
            key="writing"
            band={revealed.band}
            wordCount={revealed.wordCount}
            onPractice={ctaClick('writing_checker')}
          />
        );
      }
    }
    const section = skill === 'writing' ? writing : speaking;
    if (!section) return <SkippedCard key={skill} skill={skill} onPractice={ctaClick(`practice_${skill}`)} />;
    return <SelfAssessedCard key={skill} skill={skill} section={section} />;
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Your estimated IELTS band
        </h2>
      </div>

      {/* (a) Overall band hero */}
      <div>
        {stillLocked ? (
          <div className="rounded-2xl border-2 border-dashed border-accent/50 bg-accent/5 p-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Lock className="h-6 w-6" />
            </span>
            <h3 className="mt-3 text-xl font-bold text-foreground">Your overall band is ready</h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
              We marked your writing sample
              {measuredCount > 0 ? ` and scored ${measuredCount} questions` : ''}. Create a free
              account to reveal your Writing band and overall estimate — no payment, a few seconds.
            </p>
            <Button
              variant="accent"
              size="lg"
              className="mt-4 w-full max-w-sm"
              disabled={revealing}
              onClick={() => {
                emit('estimator_cta_click', { destination: 'unlock_overall' });
                if (signedIn) reveal();
                else setSignInOpen(true);
              }}
            >
              {revealing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Unlocking…
                </>
              ) : (
                <>
                  Reveal my band <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            {revealError ? <p className="mt-2 text-xs text-destructive">{revealError}</p> : null}
            <p className="mt-3 text-xs text-muted-foreground">
              Your Reading and Listening bands are shown below either way.
            </p>
          </div>
        ) : (
          <>
            <BandHero
              band={typeof effectiveOverall === 'number' ? effectiveOverall : undefined}
              subtitle={heroCaption}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">{heroCaption}</p>
            {typeof effectiveOverall === 'number' ? (
              <ShareRow
                className="mt-4"
                source="estimator_result"
                path="/band-estimator"
                text={`My estimated IELTS band is ${formatBand(effectiveOverall)} — check yours free in 15 minutes at IELTS-Bank`}
              />
            ) : null}
          </>
        )}
        <div className="mt-4">
          <CtaCard
            icon={Sparkles}
            tone="plain"
            title="Confirm this with a full 40-question mock"
            body="A complete timed mock test gives a sharper read than this 20-question snapshot."
            actionLabel="Take a mock test"
            href="/mock-test"
            onClick={ctaClick('mock_test')}
          />
        </div>
      </div>

      {/* (b) Per-skill cards */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Skill by skill
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {['reading', 'listening', 'writing', 'speaking'].map((skill) => renderCard(skill))}
        </div>
      </div>

      {revealed ? (
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Your Writing feedback
          </h3>
          <WritingScoreReport
            task={2}
            sourceLabel={`Indicative short Writing sample${
              revealed.wordCount ? ` · ${revealed.wordCount} words` : ''
            }`}
            submissionLabel="sample"
            analyticsSource="estimator_score_tease"
            result={{
              overallBand: revealed.band,
              wordCount: revealed.wordCount,
              criteria: revealed.criteria || {},
              summary: revealed.summary || '',
              improvements: revealed.improvements || [],
              correctedExamples: revealed.correctedExamples || [],
              free: revealed.premium !== true,
              lockedIssueCount: revealed.lockedIssueCount,
            }}
          />
        </div>
      ) : null}

      {/* (c) Target-band selector + gap */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold text-foreground">What band do you need?</h3>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TARGET_BANDS.map((label) => {
            const selected = parseTarget(label) === targetBand;
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleTarget(label)}
                aria-pressed={selected}
                className={cn(
                  'min-w-[3.5rem] justify-center rounded-lg border px-3 py-2 text-sm font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-accent bg-accent/10 text-foreground'
                    : 'border-input text-muted-foreground hover:border-accent/50 hover:text-foreground'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {gap !== null ? (
          <p className="mt-4 text-sm text-foreground">
            {gap > 0 ? (
              <>
                You&apos;re ~{gap.toFixed(1)} band{gap === 1 ? '' : 's'} away from your target.
                {worst ? (
                  <> Biggest gap: <span className="font-semibold">{SKILL_META[worst.skill].label}</span>.</>
                ) : null}
              </>
            ) : (
              <>You&apos;re already at or above your target band — keep it sharp.</>
            )}
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Measure at least two skills to see how far you are from your target.
          </p>
        )}
      </div>

      {/* (c2) The personalised plan is part of the account reward, so it appears
          alongside the revealed band rather than to an anonymous visitor. */}
      {!stillLocked ? (
        <StudyPlan worst={worst} gap={gap} targetBand={targetBand} onCta={ctaClick} />
      ) : null}

      {/* (d) Conversion block */}
      <div className="space-y-3">
        {signedIn && (planLoading || planError) ? (
          <div
            role={planError ? 'alert' : 'status'}
            aria-live="polite"
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 text-sm shadow-sm"
          >
            {planLoading ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" />
            ) : (
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            )}
            <div>
              <div className="font-bold text-foreground">
                {planLoading ? 'Checking your plan…' : 'Your plan could not be verified'}
              </div>
              <p className="mt-0.5 text-muted-foreground">
                {planLoading
                  ? 'Your personalised Writing and Speaking next steps will appear in a moment.'
                  : planError}
              </p>
            </div>
          </div>
        ) : (
          <>
            <CtaCard
              icon={PenLine}
              tone="primary"
              title={isPremium ? 'Score your writing' : 'Get your real Writing band'}
              body={
                isPremium
                  ? 'Submit an essay and get an examiner-style band with criterion feedback.'
                  : 'Self-ratings run about half a band optimistic. Get your real Writing band from AI scoring.'
              }
              actionLabel={isPremium ? 'Score my writing' : 'Get my Writing band'}
              href="/ielts-writing-checker"
              onClick={ctaClick('writing_checker')}
            />
            <CtaCard
              icon={Mic}
              tone="primary"
              title={isPremium ? 'Meet your examiner' : 'Meet the AI examiner'}
              body={
                isPremium
                  ? 'Practise a full speaking test with the AI examiner and get a band.'
                  : 'Get your Speaking measured in a realistic mock interview with the AI examiner.'
              }
              actionLabel={isPremium ? 'Start speaking' : 'Meet the examiner'}
              href="/speaking-examiner"
              onClick={ctaClick('speaking_examiner')}
            />
          </>
        )}

        {!signedIn && !stillLocked ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <div>
                <div className="text-sm font-bold text-foreground">Save this as your baseline</div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Create a free account and track your improvement from here.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => {
                emit('estimator_cta_click', { destination: 'save_account' });
                setSignInOpen(true);
              }}
            >
              Save my baseline
            </Button>
          </div>
        ) : null}
      </div>

      {/* Newsletter (last). onSubmit bubbles up from the inner form so we can
          attribute the estimator_cta_click without modifying NewsletterSignup. */}
      <div
        onSubmit={() => emit('estimator_cta_click', { destination: 'newsletter' })}
        data-analytics-id="estimator_newsletter"
      >
        <NewsletterSignup source="band-estimator" />
      </div>

      {/* Retake */}
      <div className="flex justify-center border-t border-border pt-6">
        <button
          type="button"
          onClick={() => {
            emit('estimator_retake');
            onRetake?.();
          }}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="h-4 w-4" /> Retake the test
        </button>
      </div>

      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        redirectOnFinish={false}
        trigger={stillLocked ? 'estimator_unlock' : 'estimator_save'}
        title={stillLocked ? 'Reveal your band' : 'Save your estimate'}
        description={
          stillLocked
            ? 'Create a free account to unlock your Writing band, your overall estimate and your plan. No payment.'
            : 'Create a free account to keep this baseline and track your progress.'
        }
      />
    </div>
  );
}
