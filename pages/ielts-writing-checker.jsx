import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  Sparkles,
  PenLine,
  Gauge,
  MessageSquareText,
  ArrowRight,
  ClipboardList,
  Wand2,
  ListChecks,
} from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import NewsletterSignup from '../src/components/NewsletterSignup';
import SignInDialog from '../src/components/auth/SignInDialog';
import { useAuth } from '../src/lib/auth';
import { saveAttemptToSupabase } from '../src/lib/progress';
import { getSupabase } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Select } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { cn } from '../src/lib/utils';
import { getAnonId, track } from '../src/lib/analytics';
import AiQuotaPanel from '../src/components/AiQuotaPanel';
import FreeSampleChip from '../src/components/question/FreeSampleChip';
import { ScoringProgress } from '../src/components/question/ScoreUI';
import WritingScoreReport from '../src/components/question/WritingScoreReport';
import { getSessionAccess } from '../src/lib/sessionAccess';
import { consumeWritingDraft } from '../src/lib/writingDraft';

import { WRITING_CHECKER_SEO } from '../lib/writingCheckerSeo';
import { WRITING_PROMPT_MAX_CHARS } from '../lib/writingLimits';
const SCORE_API = '/api/score/writing';
const CANONICAL = WRITING_CHECKER_SEO.canonical;
const DRAFT_KEY = 'ielts-writing-checker-draft';
// Analytics identifier for this tool (there is no passage row behind it).
const CHECKER_SLUG = 'writing-checker';

// Task-type options. The scoring API only distinguishes Task 1 vs Task 2, so
// both Task 1 variants map to apiTask=1; the label is passed to the model as
// part of the prompt text so it can apply the right expectations.
const TASK_TYPES = [
  { value: 'task1-academic', label: 'Task 1 — Academic', apiTask: 1, minWords: 150 },
  { value: 'task1-general', label: 'Task 1 — General Training', apiTask: 1, minWords: 150 },
  { value: 'task2', label: 'Task 2 — Essay', apiTask: 2, minWords: 250 },
];

const HOW_IT_WORKS = [
  {
    icon: ClipboardList,
    title: 'Paste your essay',
    desc: 'Choose your task type, optionally add the question, and paste your Task 1 or Task 2 answer.',
  },
  {
    icon: Wand2,
    title: 'Get an instant AI score',
    desc: 'Our AI examiner marks your writing against all four official IELTS criteria in under a minute.',
  },
  {
    icon: ListChecks,
    title: 'See exactly what to fix',
    desc: 'Read criterion-by-criterion feedback, corrected examples and concrete tips to raise your band.',
  },
];

const FAQ = [
  {
    q: 'Is this the official IELTS score?',
    a: "No. This is an AI-generated estimate based on the public IELTS band descriptors. It is a study aid to help you improve — only a certified examiner in a real IELTS test can give you an official band score.",
  },
  {
    q: 'Is it free?',
    a: 'Yes, your first AI Writing score is free after you create an account. It shows your overall band and one criterion in full. Premium unlocks the other three criteria, examiner summary, improvement plan, corrected examples, and continued scoring.',
  },
  {
    q: 'Do you store my essay?',
    a: 'You create an account before scoring, and your essay and its band score are saved to it so you can review your progress on your dashboard — your draft is never lost while you sign up or upgrade. We do not sell or publish your writing, and you can request deletion at any time.',
  },
  {
    q: 'Which tasks can I check?',
    a: 'All of them: Academic Task 1 (graphs, charts, maps and processes), General Training Task 1 (letters), and Task 2 essays for both Academic and General Training.',
  },
];

const SAMPLE_FEEDBACK = {
  overallBand: 6.5,
  wordCount: 268,
  criteria: {
    taskResponse: {
      band: 6.5,
      feedback:
        'You address both views and give your opinion, and your position is clear throughout ("I firmly believe that…"). Some ideas, such as the paragraph on remote work, are asserted rather than fully developed with examples, which holds this back from band 7.',
    },
    coherenceCohesion: {
      band: 7,
      feedback:
        'Ideas are logically sequenced and paragraphing is effective. Linking words ("Furthermore", "On the other hand") are used accurately, though a few sentences over-rely on "and" to join clauses.',
    },
    lexicalResource: {
      band: 6,
      feedback:
        'You use some good topic vocabulary ("commute", "flexibility"), but there is repetition of "important" and a few collocation slips ("do a decision"). Widening your range of precise word choices would lift this score.',
    },
    grammaticalRange: {
      band: 6.5,
      feedback:
        'A mix of simple and complex sentences with generally good control. Occasional article and preposition errors ("in the last decade" written as "on the last decade") appear but rarely block meaning.',
    },
  },
  summary:
    'A solid, well-organised response with a clear position. To move toward band 7, develop each idea with a specific example and broaden your vocabulary to reduce repetition.',
};

export default function WritingCheckerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [taskType, setTaskType] = useState('task2');
  const [prompt, setPrompt] = useState('');
  const [essay, setEssay] = useState('');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [signInOpen, setSignInOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quotaResetsAt, setQuotaResetsAt] = useState(null);
  // True once the user has pressed submit while signed-out — after they sign in
  // the submission resumes automatically (score if premium, billing if not).
  const pendingSubmitRef = useRef(false);
  // Last essay text already captured to the account — prevents duplicate
  // attempt rows when the gate fires repeatedly for the same draft.
  const capturedEssayRef = useRef('');
  // Set when the homepage hero handed off an essay: once auth has resolved we
  // run the normal submit path for the user without a second click.
  const [autoRun, setAutoRun] = useState(false);
  // Draft restore runs exactly once and gates the persist effect below.
  const [restored, setRestored] = useState(false);
  const restoredRef = useRef(false);
  const autoRunDoneRef = useRef(false);
  const formRef = useRef(null);

  const active = TASK_TYPES.find((t) => t.value === taskType) || TASK_TYPES[2];
  const apiTask = active.apiTask;
  const minWords = active.minWords;

  const wordCount = essay.split(/\s+/).filter(Boolean).length;
  const progressValue = Math.min((wordCount / minWords) * 100, 100);
  const isSufficient = wordCount >= minWords;

  // Restore a draft on mount. Two sources, in priority order:
  //   1. A one-shot handoff from the homepage hero paste box (sessionStorage).
  //      It wins over the stored draft and arms an automatic submit so the user
  //      continues straight into the existing flow — sign-in gate, free sample,
  //      report — instead of pressing the same button twice.
  //   2. This page's own draft (localStorage), which carries a signed-out
  //      user's work across the sign-in round-trip.
  useEffect(() => {
    if (typeof window === 'undefined' || restoredRef.current) return;
    // React StrictMode double-invokes mount effects in development. Without
    // this guard the second pass finds the handoff already consumed, falls
    // through to the localStorage branch, and restores the EMPTY draft the
    // persist effect wrote from initial state — silently wiping the essay the
    // hero just handed over.
    restoredRef.current = true;
    const handoff = consumeWritingDraft();
    if (handoff) {
      setTaskType(handoff.taskType);
      setPrompt(handoff.prompt);
      setEssay(handoff.essay);
      if (handoff.autoSubmit) setAutoRun(true);
      setRestored(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        if (typeof saved.taskType === 'string') setTaskType(saved.taskType);
        if (typeof saved.prompt === 'string') setPrompt(saved.prompt);
        if (typeof saved.essay === 'string') setEssay(saved.essay);
      }
    } catch {
      /* ignore malformed draft */
    } finally {
      setRestored(true);
    }
  }, []);

  // Persist the draft on every change so nothing is lost on navigation/auth.
  // Gated on `restored` so the first render's empty state never overwrites a
  // stored draft before the restore above has had a chance to load it.
  useEffect(() => {
    if (typeof window === 'undefined' || !restored) return;
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ taskType, prompt, essay })
      );
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [restored, taskType, prompt, essay]);

  // Premium gate: capture the essay to the signed-in user's account (attempt
  // row without a band — the checker has no passage row, so passage_id stays
  // null), then send them to billing. The draft also persists in localStorage
  // on every change, so the form is intact when they come back.
  const goToPremium = useCallback(async () => {
    if (user?.id && essay.trim() && capturedEssayRef.current !== essay) {
      const res = await saveAttemptToSupabase({
        userId: user.id,
        passageId: null,
        skill: 'writing',
        responses: { essay, prompt: prompt.trim(), task: apiTask },
        band: null,
      });
      if (res.ok) capturedEssayRef.current = essay;
    }
    track('paywall_redirect', { skill: 'writing', slug: CHECKER_SLUG, source: 'writing_checker_submit' });
    router.push('/pricing?upgrade=writing');
  }, [apiTask, essay, prompt, router, user?.id]);

  const runScore = useCallback(async () => {
    setErrorMsg('');
    setResult(null);

    if (!isSufficient) {
      setErrorMsg(
        `Your answer must be at least ${minWords} words to be scored. Current word count: ${wordCount}.`
      );
      return;
    }

    setIsLoading(true);
    track('writing_submit', { skill: 'writing', slug: 'writing-checker', task: apiTask, word_count: wordCount, signed_in: Boolean(user) });
    let scored = false;
    try {
      const headers = { 'Content-Type': 'application/json' };
      const session = await getSessionAccess(getSupabase);
      if (session.error) {
        track('ai_score_result', {
          skill: 'writing',
          slug: CHECKER_SLUG,
          outcome: 'error',
          error_type: 'auth_session',
          task: apiTask,
          signed_in: Boolean(user),
        });
        setErrorMsg('Could not verify your session. Please refresh and try again.');
        return;
      }
      if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

      // Prepend the task-type label to the free-form prompt so the model knows
      // whether this is Academic Task 1, General Training Task 1, or Task 2.
      const promptText = [active.label, prompt.trim()].filter(Boolean).join('\n\n');

      const response = await fetch(SCORE_API, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: promptText,
          essay,
          task: apiTask,
          passage_id: null,
          anon_id: getAnonId(),
        }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        /* non-JSON error body */
      }

      if (response.ok && data) {
        // Result renders after the ScoringProgress run-through completes
        // (results show when result && !isLoading; onFinished flips loading).
        scored = true;
        setResult(data);
        track('ai_score_result', { skill: 'writing', slug: 'writing-checker', outcome: 'ok', band: data.overallBand, task: apiTask, word_count: wordCount, free: data.free === true, signed_in: Boolean(user) });
      } else if (response.status === 401) {
        // No session (or it expired): sign in and the submission resumes when
        // the dialog closes.
        pendingSubmitRef.current = true;
        setSignInOpen(true);
        setErrorMsg((data && data.error) || 'Please sign in to score this essay.');
      } else if (response.status === 402 && data?.reason === 'premium_required') {
        // Server-side premium gate (covers a stale client plan): capture the
        // essay to the account and send them to billing.
        track('ai_score_result', { skill: 'writing', slug: 'writing-checker', outcome: 'premium_gate', task: apiTask, signed_in: Boolean(user) });
        await goToPremium();
      } else if (response.status === 402 || response.status === 429) {
        setQuotaResetsAt(data?.resetsAt || null);
        setQuotaOpen(true);
        track('ai_score_result', { skill: 'writing', slug: 'writing-checker', outcome: 'rate_limited', task: apiTask, signed_in: Boolean(user) });
        setErrorMsg(
          (data && data.error) ||
            'You have reached the daily scoring limit. Please try again later.'
        );
      } else {
        track('ai_score_result', { skill: 'writing', slug: 'writing-checker', outcome: 'error', http_status: response.status, task: apiTask, signed_in: Boolean(user) });
        setErrorMsg((data && data.error) || 'Failed to score your essay. Please try again.');
      }
    } catch {
      track('ai_score_result', { skill: 'writing', slug: 'writing-checker', outcome: 'error', error_type: 'network', task: apiTask, signed_in: Boolean(user) });
      setErrorMsg('A network error occurred. Please try again.');
    } finally {
      if (!scored) setIsLoading(false);
    }
  }, [active.label, apiTask, essay, goToPremium, isSufficient, minWords, prompt, user, wordCount]);

  // The route owns the entitlement decision because a non-premium account may
  // still have its one lifetime sample available.
  const continueSubmit = useCallback(() => {
    runScore();
  }, [runScore]);

  // Shared by the form's own submit button and by the homepage-hero handoff.
  const startSubmit = useCallback(() => {
    setErrorMsg('');

    if (!isSufficient) {
      setErrorMsg(
        `Your answer must be at least ${minWords} words to be scored. Current word count: ${wordCount}.`
      );
      return;
    }

    // Premium-only scoring: signed-out visitors sign up first (the draft is
    // persisted by the effect above, so nothing is lost); the submission
    // resumes when the dialog closes and routes to billing if needed.
    if (!loading && !user) {
      pendingSubmitRef.current = true;
      setSignInOpen(true);
      track('premium_gate', { skill: 'writing', slug: CHECKER_SLUG, stage: 'signup' });
      return;
    }

    continueSubmit();
  }, [continueSubmit, isSufficient, loading, minWords, user, wordCount]);

  const handleSubmit = (e) => {
    e.preventDefault();
    startSubmit();
  };

  // Continue the homepage hero's submission once auth has resolved. Runs once:
  // a refresh of this page will not silently re-score (the handoff record was
  // consumed on read, and the ref guards a same-mount re-entry).
  useEffect(() => {
    if (!autoRun || loading || autoRunDoneRef.current) return;
    autoRunDoneRef.current = true;
    setAutoRun(false);
    if (typeof formRef.current?.scrollIntoView === 'function') {
      formRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    startSubmit();
  }, [autoRun, loading, startSubmit]);

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  const pageTitle = WRITING_CHECKER_SEO.title;
  const metaDescription = WRITING_CHECKER_SEO.description;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={WRITING_CHECKER_SEO.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={WRITING_CHECKER_SEO.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={WRITING_CHECKER_SEO.ogImage} />
        <meta name="twitter:image:alt" content={WRITING_CHECKER_SEO.imageAlt} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />

        <main className="flex-1">
          {/* Hero */}
          <section className="border-b border-border bg-secondary/40">
            <div className="mx-auto max-w-4xl px-4 py-12 text-center sm:px-6 md:py-16 lg:px-8">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                AI-powered tool
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                AI IELTS Writing Checker
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Create an account to try your first AI score free. See your overall band and
                one criterion in full; Premium unlocks the remaining criteria, examiner
                summary, improvement plan, and corrected examples.
              </p>
            </div>
          </section>

          {/* Tool */}
          <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-1.5">
                  <Label htmlFor="task-type">Task type</Label>
                  <Select
                    id="task-type"
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                  >
                    {TASK_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="prompt">
                    Question / prompt{' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={WRITING_PROMPT_MAX_CHARS}
                    placeholder="Paste the exact task question here for more accurate feedback…"
                    className="min-h-[80px] resize-y"
                  />
                </div>

                <div className="grid gap-1.5">
                  <div className="flex items-end justify-between gap-4">
                    <Label htmlFor="essay">Your essay</Label>
                    <div className="w-40">
                      <div
                        className={cn(
                          'mb-1 text-right text-xs font-medium',
                          isSufficient ? 'text-accent' : 'text-muted-foreground'
                        )}
                      >
                        {wordCount} / {minWords} words
                      </div>
                      <Progress
                        value={progressValue}
                        indicatorClassName={isSufficient ? 'bg-accent' : 'bg-primary'}
                      />
                    </div>
                  </div>
                  <Textarea
                    id="essay"
                    value={essay}
                    onChange={(e) => setEssay(e.target.value)}
                    placeholder="Paste or write your full response here…"
                    className="min-h-[280px] resize-y"
                  />
                  <p className="text-xs text-muted-foreground">
                    Aim for at least {minWords} words — the IELTS minimum for{' '}
                    {apiTask === 1 ? 'Task 1' : 'Task 2'}. Shorter answers are penalised.
                  </p>
                </div>

                {errorMsg && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {errorMsg}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="accent"
                  size="lg"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading
                    ? 'Analyzing…'
                    : !loading && !user
                    ? 'Sign in & check my writing'
                    : 'Check my writing'}
                </Button>
                <AiQuotaPanel userId={user?.id} remaining={result?.quotaRemaining} open={quotaOpen} onClose={() => setQuotaOpen(false)} skill="writing" resetsAt={quotaResetsAt} />
                {!loading && !user ? (
                  <p className="text-center text-xs text-muted-foreground">
                    Create a free account to get your first AI score. Your draft stays safe
                    while you sign up.
                  </p>
                ) : (
                  <FreeSampleChip />
                )}
              </form>
            </div>

            {/* Loading state */}
            {isLoading && (
              <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
                <h2 className="mb-2 text-lg font-bold tracking-tight text-foreground">
                  Analyzing your response
                </h2>
                <ScoringProgress done={Boolean(result)} onFinished={() => setIsLoading(false)} />
              </div>
            )}

            {/* Result */}
            {result && !isLoading && (
              <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
                <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
                  Your estimated score &amp; feedback
                </h2>
                <WritingScoreReport task={apiTask} result={result} />
                <div className="mt-5 rounded-lg border border-accent/30 bg-accent/5 p-4">
                  <p className="text-sm font-semibold text-foreground">Put the feedback into practice</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button variant="accent" onClick={() => { setResult(null); window.scrollTo({ top: 360, behavior: 'smooth' }); }}>Score another draft{result.quotaRemaining != null ? ` (${result.quotaRemaining} left)` : ''}</Button>
                    <Button asChild variant="outline"><NextLink href="/writingquestion">Choose a Writing task</NextLink></Button>
                  </div>
                </div>
                <p className="mt-4 rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                  This is an AI estimate for study purposes, not an official IELTS result.
                </p>
              </div>
            )}
          </section>

          {/* How it works */}
          <section className="border-t border-border bg-secondary/30">
            <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
              <h2 className="text-center text-2xl font-bold tracking-tight text-foreground">
                How the writing checker works
              </h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-3">
                {HOW_IT_WORKS.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.title}
                      className="rounded-xl border border-border bg-card p-6 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 ring-1 ring-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </span>
                        <span className="text-sm font-bold text-muted-foreground">
                          Step {i + 1}
                        </span>
                      </div>
                      <h3 className="mt-4 text-base font-bold text-foreground">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {step.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Sample feedback */}
          <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                What your feedback looks like
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A sample of the criterion-by-criterion breakdown you receive for a Task 2
                essay.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
              <WritingScoreReport task={2} result={SAMPLE_FEEDBACK} sample />
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Illustrative example. Your own feedback is generated from your essay.
              </p>
            </div>
          </section>

          {/* Feature strip / internal links */}
          <section className="border-t border-border bg-secondary/30">
            <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="flex flex-col items-start gap-2">
                  <Gauge className="h-6 w-6 text-accent" />
                  <h3 className="text-base font-bold text-foreground">Instant band estimate</h3>
                  <p className="text-sm text-muted-foreground">
                    Get an overall band and per-criterion scores in under a minute.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <MessageSquareText className="h-6 w-6 text-accent" />
                  <h3 className="text-base font-bold text-foreground">Actionable feedback</h3>
                  <p className="text-sm text-muted-foreground">
                    Corrected examples and concrete tips show you exactly what to fix.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <PenLine className="h-6 w-6 text-accent" />
                  <h3 className="text-base font-bold text-foreground">Practise on real tasks</h3>
                  <p className="text-sm text-muted-foreground">
                    Prefer a real question?{' '}
                    <NextLink
                      href="/writingquestion"
                      className="font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                    >
                      Browse the writing question bank
                    </NextLink>{' '}
                    or estimate your{' '}
                    <NextLink
                      href="/band-calculator"
                      className="font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                    >
                      overall band score
                    </NextLink>
                    .
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Newsletter */}
          <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
            <NewsletterSignup source="writing-checker" variant="full" />
          </section>

          {/* FAQ */}
          <section className="border-t border-border">
            <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
              <h2 className="text-center text-2xl font-bold tracking-tight text-foreground">
                Frequently asked questions
              </h2>
              <div className="mt-8 space-y-4">
                {FAQ.map((item) => (
                  <div
                    key={item.q}
                    className="rounded-xl border border-border bg-card p-5 shadow-sm"
                  >
                    <h3 className="text-base font-bold text-foreground">{item.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Button asChild variant="accent">
                  <NextLink href="/writingquestion" className="no-underline">
                    Practise writing tasks
                    <ArrowRight className="h-4 w-4" />
                  </NextLink>
                </Button>
                <Button asChild variant="outline">
                  <NextLink href="/band-calculator" className="no-underline">
                    Band score calculator
                  </NextLink>
                </Button>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>

      <SignInDialog
        open={signInOpen}
        onOpenChange={(v) => {
          setSignInOpen(v);
          if (!v) {
            const shouldRun = pendingSubmitRef.current && Boolean(user);
            pendingSubmitRef.current = false;
            if (shouldRun) continueSubmit();
          }
        }}
        redirectOnFinish={false}
        title="Sign up to get your essay scored"
        description="Create a free account to get your first AI score. Your draft is saved, so nothing you’ve written is lost."
        trigger="writing_checker_score"
      />
    </>
  );
}
