import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { buildUpgradeHref } from '../../lib/upgradeContext';
import Navbar from '../components/Navbar';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Progress } from '../../components/ui/progress';
import { cn } from '../lib/utils';
import { getSupabase } from '../../lib/supabase';
import { sanitizeHtml } from '../../lib/sanitize';
import RelatedPractice from '../components/RelatedPractice';
import Modal from '../components/AccessibleModal';
import { getAnonId, track } from '../lib/analytics';
import { useAuth } from '../lib/auth';
import AiQuotaPanel from '../components/AiQuotaPanel';
import FreeSampleChip from '../components/question/FreeSampleChip';
import SignInDialog from '../components/auth/SignInDialog';
import { ScoringProgress } from '../components/question/ScoreUI';
import WritingScoreReport from '../components/question/WritingScoreReport';
import { syncLocalAttempts } from '../lib/progress';
import { getSessionAccess } from '../lib/sessionAccess';

import { SITE_URL } from '../../lib/site';
import {
  buildWritingQuestionJsonLd,
  serializeJsonLd,
} from '../../lib/writingQuestionSeo';
const SCORE_API = '/api/score/writing';
const PROMPT_HTML_CLASS =
  'text-[15px] leading-7 text-foreground [&_p]:mb-4 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1';

// Strip HTML tags from the site's prompt markup to send plain text to the
// scorer (the model does not need the markup, and this keeps the payload lean).
function htmlToText(html) {
  if (!html) return '';
  if (typeof window !== 'undefined' && window.DOMParser) {
    try {
      const doc = new window.DOMParser().parseFromString(html, 'text/html');
      return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {
      /* fall through */
    }
  }
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WritingQuestion = ({ id: docId, passage, description, related = [] }) => {
  const { user } = useAuth();
  const router = useRouter();
  const promptHtml = passage?.writing?.promptHtml || passage?.bodyHtml || '';
  const title = passage?.title || '';
  const task = passage?.writing?.task === 1 ? 1 : 2;
  const minWords = passage?.writing?.wordLimitMin || (task === 1 ? 150 : 250);
  const modelAnswerHtml = passage?.writing?.modelAnswerHtml || '';
  const modelAnswerRationaleHtml = passage?.writing?.modelAnswerRationaleHtml || '';
  const storageKey = passage?.slug || docId;

  const [userResponse, setUserResponse] = useState('');
  const [result, setResult] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quotaResetsAt, setQuotaResetsAt] = useState(null);
  const [signInOpen, setSignInOpen] = useState(false);
  // Set when a signed-out visitor hits the sign-up gate — submission resumes
  // automatically once the sign-up dialog closes with a session present.
  const pendingSubmitRef = useRef(false);

  // Backfill attempts persisted while signed out (including the essay captured
  // at the premium gate below) as soon as a session appears.
  useEffect(() => {
    if (!user?.id) return;
    syncLocalAttempts(user.id).catch(() => {});
  }, [user?.id]);

  // Restore any local draft for this prompt (foundation for the accounts wave).
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(`ielts-writing-draft:${storageKey}`);
      if (saved) setUserResponse(saved);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const handleResponseChange = useCallback(
    (e) => {
      const val = e.target.value;
      setUserResponse(val);
      if (storageKey && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(`ielts-writing-draft:${storageKey}`, val);
        } catch {
          /* ignore */
        }
      }
    },
    [storageKey]
  );

  const wordCount = userResponse.split(/\s+/).filter(Boolean).length;
  const progressValue = Math.min((wordCount / minWords) * 100, 100);
  const isSufficient = wordCount >= minWords;

  // Capture the submitted essay as a local attempt record so it lands on the
  // user's account (via syncLocalAttempts) the moment they have a session —
  // work is never lost across the sign-up + upgrade round trip. Idempotent:
  // an unchanged essay keeps its original timestamp, so the sync marker in
  // progress.js prevents duplicate attempt rows.
  const captureAttemptLocally = useCallback(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const key = `ielts-attempt:writing:${storageKey}`;
      const existing = JSON.parse(window.localStorage.getItem(key) || 'null');
      if (existing?.answers?.essay === userResponse && existing?.answers?.task === task) return;
      window.localStorage.setItem(
        key,
        JSON.stringify({
          skill: 'writing',
          slug: storageKey,
          answers: { essay: userResponse, task },
          band: null,
          timestamp: new Date().toISOString(),
        })
      );
    } catch {
      /* localStorage unavailable — non-fatal */
    }
  }, [storageKey, task, userResponse]);

  // Premium gate: save the essay to the account (attempt row without a band),
  // then send the user to the billing page. The per-keystroke draft stays in
  // localStorage, so the editor is intact when they come back.
  const goToPremium = useCallback(async () => {
    captureAttemptLocally();
    if (user?.id) await syncLocalAttempts(user.id).catch(() => {});
    track('paywall_redirect', { skill: 'writing', slug: storageKey, source: 'writing_submit' });
    router.push(buildUpgradeHref({ upgrade: 'writing', stage: 'saved', return_to: `/writingquestion/${storageKey}` }));
  }, [captureAttemptLocally, router, storageKey, user?.id]);

  const runScore = useCallback(async () => {
    track('writing_submit', { skill: 'writing', slug: storageKey, task, word_count: wordCount, signed_in: Boolean(user) });

    setResult(null);
    setIsLoading(true);
    let scored = false;
    try {
      // Attach the current linked account's access token. The server rejects
      // missing and anonymous-auth tokens before consuming the lifetime sample.
      const headers = { 'Content-Type': 'application/json' };
      const session = await getSessionAccess(getSupabase);
      if (session.error) {
        track('ai_score_result', {
          skill: 'writing',
          slug: storageKey,
          outcome: 'error',
          error_type: 'auth_session',
          task,
          signed_in: Boolean(user),
        });
        setErrorMsg('Could not verify your session. Please refresh and try again.');
        return;
      }
      if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

      const response = await fetch(SCORE_API, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: htmlToText(promptHtml),
          essay: userResponse,
          task,
          passage_id: passage?.id || null,
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
        // Don't reveal yet — the ScoringProgress modal fast-forwards through
        // its remaining stages and opens the feedback via onFinished.
        scored = true;
        setResult(data);
        track('ai_score_result', { skill: 'writing', slug: storageKey, outcome: 'ok', band: data.overallBand, task, word_count: wordCount, free: data.free === true, signed_in: Boolean(user) });
      } else if (response.status === 401) {
        // No session (or it expired): sign in and the submission resumes.
        pendingSubmitRef.current = true;
        setSignInOpen(true);
        setErrorMsg(
          (data && data.error) ||
            'Please sign in to score this response.'
        );
      } else if (response.status === 402 && data?.reason === 'premium_required') {
        // Server-side premium gate (covers a stale client plan): capture the
        // essay to the account and send them to billing.
        track('ai_score_result', { skill: 'writing', slug: storageKey, outcome: 'premium_gate', task, signed_in: Boolean(user) });
        await goToPremium();
      } else if (response.status === 402 || response.status === 429) {
        setQuotaResetsAt(data?.resetsAt || null);
        setQuotaOpen(true);
        track('ai_score_result', { skill: 'writing', slug: storageKey, outcome: 'rate_limited', task, signed_in: Boolean(user) });
        setErrorMsg(
          (data && data.error) ||
            'You have reached the scoring limit. Please try again later.'
        );
      } else {
        track('ai_score_result', { skill: 'writing', slug: storageKey, outcome: 'error', http_status: response.status, task, signed_in: Boolean(user) });
        setErrorMsg(
          (data && data.error) || 'Failed to score your answer. Please try again.'
        );
      }
    } catch {
      track('ai_score_result', { skill: 'writing', slug: storageKey, outcome: 'error', error_type: 'network', task, signed_in: Boolean(user) });
      setErrorMsg('A network error occurred. Please try again.');
    } finally {
      // On success the loading modal stays up until the animation completes
      // (handleScoringFinished); every failure path closes it immediately.
      if (!scored) setIsLoading(false);
    }
  }, [goToPremium, passage?.id, promptHtml, storageKey, task, user, userResponse, wordCount]);

  // The server owns the entitlement decision: a free user may still have the
  // one lifetime sample, while a used sample returns premium_required.
  const continueSubmit = useCallback(() => {
    runScore();
  }, [runScore]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isSufficient) {
      setErrorMsg(
        `Your answer must be at least ${minWords} words. Current word count: ${wordCount}.`
      );
      return;
    }

    // Signed-out visitors sign up first; that account receives one lifetime
    // free Writing score and the submission resumes when onboarding closes.
    if (!user) {
      captureAttemptLocally();
      pendingSubmitRef.current = true;
      setSignInOpen(true);
      track('premium_gate', { skill: 'writing', slug: storageKey, stage: 'signup' });
      return;
    }

    continueSubmit();
  };

  const handleScoringFinished = useCallback(() => {
    setIsLoading(false);
    setFeedbackOpen(true);
    // The essay is scored and saved to the account — clear the editor (and
    // the local draft) so the same text can't just be re-submitted for
    // another score.
    setUserResponse('');
    if (storageKey && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(`ielts-writing-draft:${storageKey}`);
      } catch {
        /* ignore */
      }
    }
    import('canvas-confetti').then(({ default: confetti }) => confetti({ spread: 100, particleCount: 200, origin: { y: 0.5 }, zIndex: 3000, scalar: 1.4 })).catch(() => {});
  }, [storageKey]);

  const pageTitle = title
    ? `${title} | IELTS Writing Practice | IELTS-Bank`
    : 'IELTS Writing Practice | IELTS-Bank';
  const metaDescription =
    description ||
    `AI-powered IELTS grading for your writing. Practise with a real IELTS question like: '${title}'.`;
  const canonicalUrl = `${SITE_URL}/writingquestion/${encodeURIComponent(docId || '')}`;
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
    title || 'IELTS Writing Practice'
  )}&type=writing&subtitle=${encodeURIComponent(`Task ${task}`)}`;

  if (!passage) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-lg font-semibold text-muted-foreground">Loading question…</h1>
        </div>
      </div>
    );
  }

  const jsonLd = buildWritingQuestionJsonLd({
    canonicalUrl,
    title,
    description: metaDescription,
    task,
    difficulty: passage.difficulty,
  });

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={`IELTS Writing Task ${task} practice: ${title}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={`IELTS Writing Task ${task} practice: ${title}`} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      </Head>

      <div className="min-h-screen bg-background">
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-6 pb-16 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              IELTS Writing Practice — AI-Powered Feedback
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Prompt */}
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
                Writing Prompt
              </h2>
              <div className={PROMPT_HTML_CLASS} dangerouslySetInnerHTML={{ __html: sanitizeHtml(promptHtml) }} />
              {modelAnswerHtml ? (
                <details className="mt-6 rounded-lg border border-accent/30 bg-accent/5">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Show Band 8–9 model answer
                  </summary>
                  <div className="border-t border-accent/20 px-4 py-4">
                    <div className="space-y-3 text-sm leading-7 text-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(modelAnswerHtml) }} />
                    {modelAnswerRationaleHtml ? (
                      <div className="mt-5 rounded-md border border-border bg-background p-4">
                        <h3 className="mb-2 text-sm font-bold text-foreground">Why this response works</h3>
                        <div className="text-sm leading-6 text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(modelAnswerRationaleHtml) }} />
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>

            {/* Answer */}
            <div className="flex flex-col rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-2 flex items-end justify-between gap-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
                  Your Answer
                </h2>
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
                aria-label="Your writing response"
                value={userResponse}
                onChange={handleResponseChange}
                placeholder="Write your full response here…"
                className="min-h-[320px] resize-y"
              />
              {errorMsg && (
                <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <Button variant="accent" size="lg" onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Analyzing…' : 'Get AI Feedback'}
            </Button>
          </div>
          <FreeSampleChip className="mt-3" />
          <div className="mt-2"><AiQuotaPanel userId={user?.id} remaining={result?.quotaRemaining} open={quotaOpen} onClose={() => setQuotaOpen(false)} skill="writing" resetsAt={quotaResetsAt} /></div>
          <RelatedPractice skill="writing" items={related} className="mt-10" />
        </main>
      </div>

      {/* Feedback modal — structured, plain-text render (no HTML injection) */}
      <SignInDialog
        open={signInOpen}
        onOpenChange={(v) => {
          setSignInOpen(v);
          if (!v) {
            // Fires when the dialog CLOSES (after optional onboarding), not
            // the moment the session appears — mirrors the writing checker.
            const shouldRun = pendingSubmitRef.current && Boolean(user);
            pendingSubmitRef.current = false;
            if (shouldRun) continueSubmit();
          }
        }}
        redirectOnFinish={false}
        title="Sign up to get this response scored"
        description="Create a free account to get your first AI score. Your essay is saved, so nothing you’ve written is lost."
        trigger="writing_task_score"
      />
      <Modal
        open={feedbackOpen && !!result}
        onClose={() => setFeedbackOpen(false)}
        title="Your AI Feedback & Score"
      >
        {result && <WritingScoreReport task={task} result={result} />}
        {result ? (
          <p className="mt-4 rounded-md bg-accent/5 p-3 text-sm text-foreground">
            This score is saved to your dashboard, so you can come back to it any time. Write a fresh attempt using the feedback when you’re ready.
          </p>
        ) : null}
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setFeedbackOpen(false)}>Close</Button>
        </div>
      </Modal>

      {/* Loading modal */}
      <Modal open={isLoading} onClose={() => {}} title="Analyzing your response" dismissible={false}>
        <ScoringProgress done={Boolean(result)} onFinished={handleScoringFinished} />
      </Modal>
    </>
  );
};

export default WritingQuestion;
