import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { Button } from '../../../components/ui/button';
import { cn } from '../../lib/utils';
import QuestionGroup from './QuestionGroup';
import { gradeAll, estimateBand } from './grade';
import { useAuth } from '../../lib/auth';
import { track } from '../../lib/analytics';
import NewsletterSignup from '../NewsletterSignup';
import SignInDialog from '../auth/SignInDialog';
import { canUseFreeSubmit, recordFreeSubmit } from '../../lib/freeAttempts';
import {
  resolvePassageId,
  saveAttemptToSupabase,
  markAttemptSynced,
  syncLocalAttempts,
} from '../../lib/progress';
import BandDial from '../mock/BandDial';
import SectionBreakdown from '../mock/SectionBreakdown';
import { usePlayOnMount, usePrefersReducedMotion } from '../mock/scoreAnimation';
import ShareRow from '../ShareRow';

// The stateful heart of the question-taking experience. It is UI-chrome
// agnostic: Reading and Listening pages supply their own passage/audio layout
// and drop this into the "questions" column.
//
// Props:
//   groups     - structured question_groups (each question carries `number`)
//   storageKey - passage slug (localStorage key for the attempt)
//   skill      - 'reading' | 'listening' (used in the storage key + band label)
//   showBand   - optional; show a rough band estimate in the results summary

function persistAttempt(skill, storageKey, answers, result, questions, startedAt, timestamp) {
  if (typeof window === 'undefined' || !storageKey) return;
  try {
    const perQuestion = {};
    Object.entries(result.byNumber).forEach(([num, r]) => {
      perQuestion[num] = {
        correct: r.correct,
        answered: r.answered,
        userAnswer: answers[num] ?? null,
        correctDisplay: r.correctDisplay,
        questionType: questions.find((question) => String(question.number) === String(num))?.type || null,
      };
    });
    const payload = {
      skill,
      slug: storageKey,
      answers,
      perQuestion,
      score: result.score,
      total: result.total,
      timestamp: timestamp || new Date().toISOString(),
      startedAt,
    };
    window.localStorage.setItem(`ielts-attempt:${skill}:${storageKey}`, JSON.stringify(payload));
  } catch {
    /* localStorage may be unavailable (private mode) — non-fatal */
  }
}

// Cross-device persistence: when a signed-in user submits, ALSO mirror the
// attempt into Supabase (in addition to the localStorage write above). This is
// fully fail-soft — any resolution/DB error is swallowed so the results UI is
// never affected. Logged-out/offline users keep only the localStorage copy.
async function persistAttemptToSupabase(userId, skill, storageKey, answers, result, questions, startedAt, submittedAt, module, mockTestId) {
  if (!userId || !storageKey) return;
  try {
    // Mock attempts link to mock_tests, not a single passage.
    const passageId = mockTestId ? null : await resolvePassageId(storageKey, skill);
    const band = estimateBand(result.score, result.total, skill, module);
    const perQuestion = {};
    Object.entries(result.byNumber).forEach(([num, item]) => {
      perQuestion[num] = {
        correct: item.correct,
        answered: item.answered,
        questionType: questions.find((question) => String(question.number) === String(num))?.type || null,
      };
    });
    const res = await saveAttemptToSupabase({
      userId,
      passageId,
      mockTestId: mockTestId || null,
      skill,
      responses: answers || {},
      rawScore: result.score,
      total: result.total,
      perQuestion,
      band: typeof band === 'number' ? band : null,
      startedAt,
      submittedAt,
    });
    if (res.ok) {
      // Record the same timestamp we wrote to the local attempt so the
      // migration pass (syncLocalAttempts) won't re-insert this submission.
      markAttemptSynced(`ielts-attempt:${skill}:${storageKey}`, submittedAt);
    }
  } catch {
    /* never break the results UI on a persistence failure */
  }
}

function ResultsSummary({ score, total, skill, module, showBand, onReset, summaryRef, signedIn, sections, byNumber }) {
  const router = useRouter();
  const pct = total ? Math.round((score / total) * 100) : 0;
  const band = showBand ? estimateBand(score, total, skill, module) : null;
  const reduced = usePrefersReducedMotion();
  const play = usePlayOnMount();
  // Per-section breakdown for mock tests: count correct answers per section.
  const sectionScores =
    Array.isArray(sections) && byNumber
      ? sections.map((section) => ({
          label: section.label,
          total: section.numbers.length,
          correct: section.numbers.filter((n) => byNumber[n]?.correct).length,
        }))
      : null;
  // Mock tests get the animated band dial + per-section breakdown (the same
  // visualization as the marketing showcase), with the weakest section flagged.
  const isMock = Array.isArray(sectionScores) && sectionScores.length > 0;
  let vizSections = sectionScores;
  let weakNote = null;
  if (isMock && sectionScores.length > 1) {
    let weakest = sectionScores[0];
    let weakestPct = weakest.total ? weakest.correct / weakest.total : 1;
    for (const s of sectionScores) {
      const p = s.total ? s.correct / s.total : 1;
      if (p < weakestPct) {
        weakest = s;
        weakestPct = p;
      }
    }
    const flagWeak = weakestPct < 1;
    vizSections = sectionScores.map((s) => ({
      ...s,
      weak: flagWeak && s.label === weakest.label,
    }));
    if (flagWeak) weakNote = `${weakest.label} was your weakest — review it first`;
  }
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      className="mb-6 rounded-lg border border-accent/40 bg-accent/5 p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {isMock && band != null ? (
            <BandDial band={band} play={play} reduced={reduced} size={112} label="est. band" />
          ) : null}
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-accent">
              Your results
            </div>
            <div className="mt-1 text-3xl font-bold text-foreground">
              {score}
              <span className="text-xl text-muted-foreground"> / {total}</span>
              <span className="ml-3 text-base font-medium text-muted-foreground">{pct}%</span>
            </div>
            {band != null && (
              <div className="mt-1 text-sm text-muted-foreground">
                {isMock ? `Estimated ${skill} band` : `Estimated ${skill} band ~${band}`}
              </div>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={onReset}>
          Try again
        </Button>
      </div>
      {isMock ? (
        <SectionBreakdown
          className="mt-5"
          sections={vizSections}
          play={play}
          reduced={reduced}
          note={weakNote}
        />
      ) : null}
      <p className="mt-3 text-sm text-muted-foreground">
        Review your answers below — correct answers are shown in green and each incorrect
        question reveals the right answer.
      </p>
      <ShareRow
        className="mt-4 justify-start"
        source={isMock ? 'mock_result' : `${skill}_result`}
        path={isMock ? '/mock-test' : (router.asPath || '/').split('?')[0]}
        text={
          isMock && band != null
            ? `I scored Band ${band} on a timed IELTS ${skill} mock at IELTS-Bank — can you beat it?`
            : `I got ${score}/${total} on an IELTS ${skill} exercise at IELTS-Bank — can you beat it?`
        }
      />
      {(skill === 'reading' || skill === 'listening') && (
        <div className="mt-4 rounded-md border border-border bg-card p-3 text-sm">
          <span className="text-muted-foreground">Ready for the next skill? </span>
          <NextLink href="/ielts-writing-checker" className="font-semibold text-accent no-underline">
            Get your IELTS Writing scored by AI
          </NextLink>
        </div>
      )}
      {!signedIn ? <NewsletterSignup source={`${skill}-results`} variant="compact" className="mt-4" /> : null}
    </div>
  );
}

function formatRemaining(seconds) {
  const safe = Math.max(0, Math.ceil(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export default function QuestionEngine({
  groups,
  storageKey,
  skill = 'reading',
  showBand = true,
  className,
  postSubmitContent = null,
  durationSeconds = null,
  module = 'academic',
  // Mock-test extras: link the saved attempt to mock_tests, and show a
  // per-section score breakdown ([{ label, numbers: [1, 2, …] }]).
  mockTestId = null,
  sections = null,
  // Positioning classes for the sticky timer/palette toolbar (merged via
  // twMerge so they can override the defaults). Pages rendering the engine in
  // normal page flow keep 'top-16' (below the fixed navbar). Pages wrapping it
  // in an internal overflow-y-auto panel should pass 'top-0' plus negative
  // margins matching the panel's padding (e.g. '-mx-5 -mt-4 rounded-none
  // border-x-0 border-t-0') so the bar docks flush to the panel's top edge.
  stickyTopClass = 'top-16',
}) {
  const [answers, setAnswers] = useState({});
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState(null);
  const [flagged, setFlagged] = useState([]);
  const [timed, setTimed] = useState(Boolean(durationSeconds));
  const [deadline, setDeadline] = useState(null);
  const [remaining, setRemaining] = useState(durationSeconds || 0);
  const [hydrated, setHydrated] = useState(false);
  const [timerAnnouncement, setTimerAnnouncement] = useState('');
  const [signInOpen, setSignInOpen] = useState(false);
  // Set when a signed-out visitor hits the free-question gate — the pending
  // submission resumes once the sign-up dialog closes with a session present.
  const pendingSubmitRef = useRef(false);
  const announcedRef = useRef(new Set());
  const resultsRef = useRef(null);
  const startedAtRef = useRef(null);
  const openedRef = useRef(null);
  const { user } = useAuth();
  const inProgressKey = useMemo(
    () => (storageKey ? `ielts-inprogress:${skill}:${storageKey}` : null),
    [skill, storageKey]
  );

  const questions = useMemo(
    () => (groups || []).flatMap((group) => group.questions || []),
    [groups]
  );

  useEffect(() => {
    setHydrated(false);
    let saved = null;
    if (typeof window !== 'undefined' && inProgressKey) {
      try {
        saved = JSON.parse(window.localStorage.getItem(inProgressKey) || 'null');
      } catch {
        saved = null;
      }
    }

    setAnswers(saved?.answers && typeof saved.answers === 'object' ? saved.answers : {});
    setFlagged(Array.isArray(saved?.flagged) ? saved.flagged : []);
    startedAtRef.current = saved?.startedAt || null;

    const shouldTime = Boolean(durationSeconds) && saved?.timed !== false;
    const savedDeadline = Number(saved?.deadline);
    const nextDeadline = shouldTime
      ? Number.isFinite(savedDeadline) && savedDeadline > 0
        ? savedDeadline
        : Date.now() + Number(durationSeconds) * 1000
      : null;
    setTimed(shouldTime);
    setDeadline(nextDeadline);
    setRemaining(nextDeadline ? Math.max(0, Math.ceil((nextDeadline - Date.now()) / 1000)) : 0);
    announcedRef.current = new Set();
    setHydrated(true);
  }, [durationSeconds, inProgressKey]);

  useEffect(() => {
    const key = `${skill}:${storageKey}`;
    if (!storageKey || openedRef.current === key) return;
    openedRef.current = key;
    track('question_open', { skill, slug: storageKey, question_type: groups?.[0]?.questionType || null, signed_in: Boolean(user?.id) });
  }, [groups, skill, storageKey, user?.id]);

  // When a user becomes present (login / initial hydration), backfill any
  // attempts they completed while logged out. Idempotent + fail-soft.
  useEffect(() => {
    if (!user?.id) return;
    syncLocalAttempts(user.id).catch(() => {});
  }, [user?.id]);

  const totalQuestions = useMemo(
    () => (groups || []).reduce((acc, g) => acc + (g.questions?.length || 0), 0),
    [groups]
  );

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== '')).length,
    [answers]
  );

  const onChange = useCallback(
    (number, value) => {
      if (submitted) return;
      if (!startedAtRef.current) {
        startedAtRef.current = new Date().toISOString();
        track('attempt_start', { skill, slug: storageKey, signed_in: Boolean(user?.id) });
      }
      setAnswers((prev) => ({ ...prev, [number]: value }));
    },
    [skill, storageKey, submitted, user?.id]
  );

  const toggleFlag = useCallback((number) => {
    setFlagged((current) =>
      current.includes(number)
        ? current.filter((item) => item !== number)
        : [...current, number]
    );
  }, []);

  const handleSubmit = useCallback(() => {
    // Free-tier gate: signed-out visitors get one free question per skill
    // (retrying the same question stays free; mock tests have their own
    // PremiumGate). Answers are already autosaved to localStorage, so nothing
    // is lost across sign-up — the submission resumes when the dialog closes.
    if (!user?.id && !mockTestId && !canUseFreeSubmit(skill, storageKey)) {
      pendingSubmitRef.current = true;
      // Stop a running timer so an expired clock doesn't re-trigger the gate
      // every tick; they can submit manually after signing up.
      setTimed(false);
      setDeadline(null);
      setSignInOpen(true);
      track('free_limit_gate', { skill, slug: storageKey });
      return;
    }
    const result = gradeAll(groups, answers);
    setResults(result);
    setSubmitted(true);
    const submittedAt = new Date().toISOString();
    const startedAt = startedAtRef.current || submittedAt;
    persistAttempt(skill, storageKey, answers, result, questions, startedAt, submittedAt);
    if (typeof window !== 'undefined' && inProgressKey) {
      try {
        window.localStorage.removeItem(inProgressKey);
      } catch {
        /* localStorage unavailable — non-fatal */
      }
    }
    if (user?.id) {
      // Cross-device mirror for signed-in users (fire-and-forget, fail-soft).
      persistAttemptToSupabase(user.id, skill, storageKey, answers, result, questions, startedAt, submittedAt, module, mockTestId).catch(
        () => {}
      );
    } else if (!mockTestId) {
      // Signed-out submission — this consumes the skill's free slot.
      recordFreeSubmit(skill, storageKey);
    }
    if (typeof window !== 'undefined') {
      const band = estimateBand(result.score, result.total, skill, module);
      track('attempt_submit', {
        skill,
        slug: storageKey,
        signed_in: Boolean(user?.id),
        score: result.score,
        total: result.total,
        score_pct: result.total ? Math.round((result.score / result.total) * 100) : 0,
        band: typeof band === 'number' ? band : null,
        answered_count: answeredCount,
        duration_seconds: Math.max(0, Math.round((Date.parse(submittedAt) - Date.parse(startedAt)) / 1000)),
      });
      window.setTimeout(() => resultsRef.current?.focus(), 0);
    }
  }, [groups, answers, skill, storageKey, user?.id, inProgressKey, module, questions, answeredCount, mockTestId]);

  // Two-step submit: with unanswered questions, the first click arms an
  // inline confirmation instead of submitting. Any answer change disarms it.
  const unansweredCount = totalQuestions - answeredCount;
  const handleSubmitClick = useCallback(() => {
    if (unansweredCount > 0 && !confirmArmed) {
      setConfirmArmed(true);
      return;
    }
    setConfirmArmed(false);
    handleSubmit();
  }, [unansweredCount, confirmArmed, handleSubmit]);

  useEffect(() => {
    setConfirmArmed(false);
  }, [answeredCount]);

  useEffect(() => {
    if (!hydrated || submitted || !timed || !deadline) return undefined;

    const tick = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      for (const threshold of [300, 60]) {
        if (next <= threshold && !announcedRef.current.has(threshold)) {
          announcedRef.current.add(threshold);
          setTimerAnnouncement(
            threshold === 300 ? 'Five minutes remaining.' : 'One minute remaining.'
          );
        }
      }
      if (next <= 0) handleSubmit();
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [deadline, handleSubmit, hydrated, submitted, timed]);

  useEffect(() => {
    if (!hydrated || submitted || !inProgressKey || typeof window === 'undefined') {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          inProgressKey,
          JSON.stringify({ answers, deadline, timed, flagged, startedAt: startedAtRef.current })
        );
      } catch {
        /* localStorage unavailable — non-fatal */
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [answers, deadline, flagged, hydrated, inProgressKey, submitted, timed]);

  const handleReset = useCallback(() => {
    setAnswers({});
    setResults(null);
    setSubmitted(false);
    setFlagged([]);
    startedAtRef.current = null;
    announcedRef.current = new Set();
    if (timed && durationSeconds) {
      const nextDeadline = Date.now() + Number(durationSeconds) * 1000;
      setDeadline(nextDeadline);
      setRemaining(Number(durationSeconds));
    }
  }, [durationSeconds, timed]);

  const toggleTimed = useCallback(() => {
    setTimed((current) => {
      const next = !current;
      if (next && durationSeconds) {
        const nextDeadline = Date.now() + Number(durationSeconds) * 1000;
        setDeadline(nextDeadline);
        setRemaining(Number(durationSeconds));
        announcedRef.current = new Set();
      } else {
        setDeadline(null);
        setRemaining(0);
      }
      return next;
    });
  }, [durationSeconds]);

  return (
    <div
      className={cn('', className)}
      data-analytics-surface="practice"
      data-analytics-skill={skill}
      data-analytics-slug={storageKey}
    >
      {submitted && results && (
        <>
          <ResultsSummary
            score={results.score}
            total={results.total}
            skill={skill}
            module={module}
            showBand={showBand}
            onReset={handleReset}
            summaryRef={resultsRef}
            signedIn={Boolean(user?.id)}
            sections={sections}
            byNumber={results.byNumber}
          />
          {postSubmitContent}
        </>
      )}

      {/* Docked toolbar: timer (while running) + question palette as ONE solid
          sticky unit — fully opaque so questions never bleed through it. */}
      <div className={cn('sticky z-20 mb-6 overflow-hidden rounded-lg border border-border bg-background shadow-md', stickyTopClass)}>
        {durationSeconds && !submitted ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-secondary/60 px-4 py-2">
            <div className="flex items-baseline gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {timed ? 'Timed' : 'Untimed'}
              </span>
              {timed ? (
                <span
                  className={cn(
                    'text-lg font-bold tabular-nums',
                    remaining <= 300 ? 'text-destructive' : 'text-foreground'
                  )}
                  aria-label={`${formatRemaining(remaining)} remaining`}
                >
                  {formatRemaining(remaining)}
                </span>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={toggleTimed} className="text-muted-foreground">
              Switch to {timed ? 'untimed' : 'timed'}
            </Button>
            <span className="sr-only" aria-live="assertive">{timerAnnouncement}</span>
          </div>
        ) : null}
        <nav aria-label="Question navigation" className="flex flex-wrap gap-1.5 p-2.5">
        {questions.map((question) => {
          const number = question.number;
          const value = answers[number];
          const answered = Array.isArray(value) ? value.length > 0 : value != null && value !== '';
          const isFlagged = flagged.includes(number);
          const reviewState = submitted && results ? results.byNumber[number]?.correct : null;
          return (
            <button
              key={number}
              type="button"
              aria-label={`Question ${number}${answered ? ', answered' : ', unanswered'}${isFlagged ? ', flagged' : ''}${reviewState === true ? ', correct' : reviewState === false ? ', incorrect' : ''}`}
              onClick={() => document.getElementById(`question-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className={cn(
                'flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:min-w-8',
                submitted && results
                  ? reviewState
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-destructive/60 bg-destructive/10 text-destructive'
                  : answered
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-foreground',
                !submitted && isFlagged && 'border-amber-500 bg-amber-100 text-amber-900'
              )}
            >
              {number}
            </button>
          );
        })}
        </nav>
      </div>

      {(groups || []).map((group) => (
        <QuestionGroup
          key={group.id}
          group={group}
          answers={answers}
          onChange={onChange}
          submitted={submitted}
          results={results}
          flagged={flagged}
          onToggleFlag={toggleFlag}
        />
      ))}

      {!submitted && (
        <div className="sticky bottom-0 -mx-1 mt-2 flex items-center justify-between gap-4 border-t border-border bg-background/95 px-1 pt-4 backdrop-blur pb-[max(1rem,env(safe-area-inset-bottom))]">
          <span className={cn('text-sm', confirmArmed ? 'font-medium text-amber-600' : 'text-muted-foreground')}>
            {confirmArmed
              ? `${unansweredCount} question${unansweredCount === 1 ? '' : 's'} unanswered — submit anyway?`
              : `${answeredCount} / ${totalQuestions} answered`}
          </span>
          <Button
            variant={confirmArmed ? 'default' : 'accent'}
            size="lg"
            onClick={handleSubmitClick}
          >
            {confirmArmed ? 'Submit anyway' : 'Submit answers'}
          </Button>
        </div>
      )}

      <SignInDialog
        open={signInOpen}
        onOpenChange={(v) => {
          setSignInOpen(v);
          if (!v) {
            // Fires when the dialog CLOSES (after optional onboarding), not
            // the moment the session appears — mirrors the writing checker.
            const shouldRun = pendingSubmitRef.current && Boolean(user?.id);
            pendingSubmitRef.current = false;
            if (shouldRun) handleSubmit();
          }
        }}
        redirectOnFinish={false}
        title={`Sign up free to submit this ${skill} question`}
        description="Your answers are safe — create a free account to see your score and track your progress. Reading and listening practice stays free."
        trigger={`${skill}_free_limit`}
      />
    </div>
  );
}
