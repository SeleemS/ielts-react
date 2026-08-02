import * as React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, Loader2 } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Button } from '../components/ui/button';
import QuestionEngine from '../src/components/question/QuestionEngine';
import SignInDialog from '../src/components/auth/SignInDialog';
import { useAuth } from '../src/lib/auth';
import { getSupabase, getStructuredPassage } from '../lib/supabase';
import { track } from '../src/lib/analytics';
import { buildQueue } from '../src/lib/reviewQueue';

// Mistake review mode: the daily-return loop the dashboard's "Mistakes worth
// revisiting" panel links into. For each practised passage we take the LATEST
// attempt's per_question and queue the questions that were wrong or skipped.
// Re-answering here runs the real QuestionEngine on just the groups that
// contain those questions, and the new attempt it records updates the queue —
// get them right and the passage clears itself. All data is the user's own
// attempts (RLS owner-select); nothing here is synthesized.

const REVIEW_SELECT =
  'id, skill, per_question, created_at, submitted_at, passages ( slug, title, skill )';

function typeLabel(type) {
  return String(type || '').replace(/_/g, ' ');
}

function ReviewRunner({ entry, onBack }) {
  const [state, setState] = React.useState({ loading: true, groups: null, error: null });

  React.useEffect(() => {
    let active = true;
    setState({ loading: true, groups: null, error: null });
    getStructuredPassage(entry.skill, entry.slug)
      .then((passage) => {
        if (!active) return;
        const missed = new Set(entry.missed);
        // Keep whole groups (completion groups embed their gaps in shared
        // instructions HTML, so per-question filtering would break rendering);
        // a group qualifies when it contains at least one missed question.
        const groups = (passage?.groups || passage?.questionGroups || []).filter((group) =>
          (group.questions || []).some((question) => missed.has(Number(question.number)))
        );
        if (!groups.length) {
          setState({ loading: false, groups: null, error: 'Nothing left to review here — nice.' });
          return;
        }
        setState({ loading: false, groups, error: null });
      })
      .catch(() => {
        if (active) {
          setState({ loading: false, groups: null, error: 'Could not load this passage. Please try again.' });
        }
      });
    return () => {
      active = false;
    };
  }, [entry]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Back to your review queue
      </button>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">{entry.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Reviewing the {entry.missed.length}{' '}
        {entry.missed.length === 1 ? 'question' : 'questions'} you missed last time
        {entry.types.length ? ` (${entry.types.map(typeLabel).join(', ')})` : ''}. Get them right
        and this passage clears from your queue.
      </p>
      <div className="mt-6">
        {state.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading questions…
          </div>
        ) : state.error ? (
          <div className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
            {state.error}
          </div>
        ) : (
          <QuestionEngine
            groups={state.groups}
            storageKey={entry.slug}
            skill={entry.skill}
            showBand={false}
          />
        )}
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [state, setState] = React.useState({ loading: true, queue: [], error: null });
  const [selected, setSelected] = React.useState(null);

  const loadQueue = React.useCallback(() => {
    setState({ loading: true, queue: [], error: null });
    getSupabase()
      .from('attempts')
      .select(REVIEW_SELECT)
      .in('skill', ['reading', 'listening'])
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) throw error;
        setState({ loading: false, queue: buildQueue(data), error: null });
      })
      .catch(() => {
        setState({ loading: false, queue: [], error: 'Could not load your mistakes. Please refresh.' });
      });
  }, []);

  React.useEffect(() => {
    if (!user?.id) return;
    loadQueue();
    track('review_open', { signed_in: true });
  }, [user?.id, loadQueue]);

  // Deep link: /review?passage=<slug> preselects that passage once loaded.
  React.useEffect(() => {
    const wanted = typeof router.query.passage === 'string' ? router.query.passage : '';
    if (!wanted || selected || state.loading) return;
    const entry = state.queue.find((item) => item.slug === wanted);
    if (entry) setSelected(entry);
  }, [router.query.passage, selected, state]);

  return (
    <>
      <Head>
        <title>Review your mistakes | IELTS-Bank</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Navbar />
      <main className="mx-auto min-h-[70vh] max-w-3xl px-4 py-10">
        {selected ? (
          <ReviewRunner
            entry={selected}
            onBack={() => {
              setSelected(null);
              loadQueue();
            }}
          />
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
              Revision queue
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
              Review your mistakes
            </h1>
            <p className="mt-2 text-muted-foreground">
              Re-answering the questions you got wrong is the single highest-value practice
              there is. Clear a passage by getting its missed questions right.
            </p>
            {authLoading ? (
              <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking your account…
              </div>
            ) : !user ? (
              <div className="mt-10 rounded-xl border bg-card p-6 text-center shadow-sm">
                <p className="font-semibold text-foreground">Sign in to see your mistakes</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your missed questions are saved to your account as you practise.
                </p>
                <Button variant="accent" className="mt-4" onClick={() => setSignInOpen(true)}>
                  Sign in
                </Button>
              </div>
            ) : state.loading ? (
              <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Building your queue…
              </div>
            ) : state.error ? (
              <div className="mt-10 rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
                {state.error}
              </div>
            ) : !state.queue.length ? (
              <div className="mt-10 rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-900">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5" /> Nothing to review — your queue is clear.
                </div>
                <p className="mt-1 text-sm">
                  New mistakes land here automatically as you practise.
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <NextLink href="/readingquestion" className="no-underline">
                    Practise something new <ArrowRight className="h-4 w-4" />
                  </NextLink>
                </Button>
              </div>
            ) : (
              <ul className="mt-8 space-y-3">
                {state.queue.map((entry) => (
                  <li key={entry.slug}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(entry);
                        track('review_start', { slug: entry.slug, skill: entry.skill, missed: entry.missed.length });
                      }}
                      className="flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-accent/50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                        <RotateCcw className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-foreground">
                          {entry.title}
                        </span>
                        <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                          {entry.skill} · {entry.missed.length}{' '}
                          {entry.missed.length === 1 ? 'question' : 'questions'} to clear
                          {entry.types.length ? ` · ${entry.types.slice(0, 2).map(typeLabel).join(', ')}` : ''}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
      <Footer />
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} trigger="review" />
    </>
  );
}
