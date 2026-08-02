import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { Lock, Clock, FileCheck2, Gauge, RefreshCw } from 'lucide-react';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import QuestionEngine from '../../src/components/question/QuestionEngine';
import AudioPlayer from '../../src/components/question/AudioPlayer';
import SignInDialog from '../../src/components/auth/SignInDialog';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { sanitizeHtml } from '../../lib/sanitize';
import { getMockTest, listMockTests, getSupabase as getBrowserSupabase } from '../../lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { usePlan } from '../../src/lib/usePlan';
import { track } from '../../src/lib/analytics';

import { getMockSeo } from '../../lib/mockSeo';
import {
  buildMockTestJsonLd,
  serializeJsonLd,
} from '../../lib/mockStructuredData';
const PASSAGE_CLASS =
  'text-[15px] leading-7 text-foreground [&_p]:mb-4 [&_strong]:font-semibold [&_em]:italic [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6';

// Flatten every section's groups into one continuously numbered set (1..40)
// and record which numbers belong to which section for the results breakdown.
function combineGroups(sections) {
  let number = 0;
  const sectionMeta = [];
  const groups = sections.flatMap((section, sectionIndex) => {
    const numbers = [];
    const sectionGroups = (section.passage.groups || []).map((group) => ({
      ...group,
      id: `${section.id}:${group.id}`,
      prompt: `Section ${sectionIndex + 1} · ${group.prompt || 'Questions'}`,
      questions: (group.questions || []).map((question) => {
        number += 1;
        numbers.push(number);
        return { ...question, number, globalNumber: number };
      }),
    }));
    sectionMeta.push({ label: `Section ${sectionIndex + 1}`, numbers });
    return sectionGroups;
  });
  return { groups, sectionMeta };
}

const PREMIUM_POINTS = [
  { icon: Clock, text: 'Real exam timing with an auto-submitting countdown' },
  { icon: FileCheck2, text: 'Full-length papers — 40 questions across every section' },
  { icon: Gauge, text: 'Instant marking with an estimated IELTS band' },
  { icon: RefreshCw, text: 'Unlimited retakes of every mock in the bank' },
];

function PremiumGate({ mock, signedIn, onSignIn }) {
  React.useEffect(() => {
    track('mock_paywall_shown', { slug: mock.slug, signed_in: signedIn });
  }, [mock.slug, signedIn]);

  return (
    <div className="mx-auto mt-10 max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
        <Lock className="h-7 w-7 text-accent" />
      </span>
      <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
        Mock tests are part of Premium
      </h2>
      <p className="mt-2 text-muted-foreground">
        Sit {mock.title} under real exam conditions and see exactly where you stand before test
        day.
      </p>
      <ul className="mx-auto mt-6 max-w-md space-y-3 text-left">
        {PREMIUM_POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 text-sm text-foreground">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10">
              <Icon className="h-3.5 w-3.5 text-accent" />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <Button asChild variant="accent" size="lg" className="mt-7 w-full sm:w-auto sm:px-10">
        <NextLink
          href="/pricing"
          onClick={() => track('paywall_upgrade_click', { source: 'mock', slug: mock.slug })}
          className="no-underline"
        >
          See Premium plans
        </NextLink>
      </Button>
      {!signedIn && (
        <p className="mt-4 text-sm text-muted-foreground">
          Already Premium?{' '}
          <button
            type="button"
            onClick={onSignIn}
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            Sign in
          </button>
        </p>
      )}
    </div>
  );
}

export default function MockTestPage({ mock }) {
  const { user, loading: authLoading } = useAuth();
  const { isPremium, loading: planLoading } = usePlan();
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [fullMock, setFullMock] = React.useState(null);
  const [contentStatus, setContentStatus] = React.useState('idle');

  const resolvedMock = fullMock || mock;
  const hasContent = Array.isArray(resolvedMock.sections) && resolvedMock.sections.length > 0;
  const { groups, sectionMeta } = hasContent
    ? combineGroups(resolvedMock.sections)
    : { groups: [], sectionMeta: [] };
  const seo = getMockSeo(mock);
  const jsonLd = buildMockTestJsonLd(mock, seo);

  React.useEffect(() => {
    // NOTE: `contentStatus` must NOT be a dependency, and must not gate this
    // effect. Setting it to 'loading' below would otherwise re-run the effect,
    // whose cleanup flips the in-flight request's `active` flag to false, so the
    // resolved response is discarded and the mock is never shown (stuck skeleton
    // for Premium users even though /api/mock returns 200). `fullMock` is the
    // idempotency guard instead.
    if (!user?.id || planLoading || !isPremium || fullMock) return;
    let active = true;
    setContentStatus('loading');
    getBrowserSupabase()
      .auth.getSession()
      .then(({ data }) =>
        fetch(`/api/mock/${encodeURIComponent(mock.slug)}`, {
          headers: { Authorization: `Bearer ${data?.session?.access_token || ''}` },
        })
      )
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not load this mock test.');
        if (active) {
          setFullMock(body.mock);
          setContentStatus('ready');
        }
      })
      .catch(() => {
        if (active) setContentStatus('error');
      });
    return () => {
      active = false;
    };
  }, [fullMock, isPremium, mock.slug, planLoading, user?.id]);

  // Resolve to a definite state before rendering either branch — no flash of
  // paid content, no paywall flicker for premium users.
  const checkingAccess =
    authLoading ||
    planLoading ||
    (isPremium && !hasContent && contentStatus !== 'error');
  const locked = !checkingAccess && !isPremium;

  return (
    <>
      <Head>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <link rel="canonical" href={seo.canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
        <meta property="og:url" content={seo.canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={seo.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={seo.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.title} />
        <meta name="twitter:description" content={seo.description} />
        <meta name="twitter:image" content={seo.ogImage} />
        <meta name="twitter:image:alt" content={seo.imageAlt} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      </Head>
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <NextLink href="/mock-test" className="text-sm font-semibold text-accent no-underline">← All mock tests</NextLink>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="emerald" className="capitalize">{mock.skill}</Badge>
            {mock.module ? <Badge variant="secondary" className="capitalize">{mock.module}</Badge> : null}
            <Badge variant="secondary">Premium</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">{mock.title}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{mock.description}</p>

          {checkingAccess ? (
            <div className="mt-10 space-y-4">
              <div className="h-8 w-56 animate-pulse rounded bg-muted" />
              <div className="h-64 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : locked ? (
            <PremiumGate mock={mock} signedIn={Boolean(user)} onSignIn={() => setSignInOpen(true)} />
          ) : contentStatus === 'error' ? (
            <div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
              We could not load the protected mock content. Refresh the page and try again.
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:self-start lg:pr-2">
                {resolvedMock.sections.map((section, index) => (
                  <article key={section.id} className="rounded-lg border border-border bg-card shadow-sm">
                    <div className="border-b border-border px-5 py-3">
                      <h2 className="font-bold text-foreground">Section {index + 1}: {section.passage.title}</h2>
                    </div>
                    <div className="p-5">
                      {section.passage.audioUrl ? (
                        <AudioPlayer
                          src={section.passage.audioUrl}
                          className="mb-5"
                          onPlay={() => track('audio_play', { skill: 'listening', slug: `mock:${mock.slug}:s${index + 1}`, signed_in: Boolean(user?.id) })}
                        />
                      ) : null}
                      {section.passage.bodyHtml ? (
                        <div className={PASSAGE_CLASS} dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.passage.bodyHtml) }} />
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>

              <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <QuestionEngine
                  groups={groups}
                  storageKey={`mock:${mock.slug}`}
                  skill={mock.skill}
                  module={mock.module || 'academic'}
                  durationSeconds={mock.durationSeconds}
                  mockTestId={mock.id}
                  sections={sectionMeta}
                  showBand
                />
              </div>
            </div>
          )}
        </main>
        <Footer />
      </div>
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        title="Sign in to your account"
        description="Premium unlocks every full-length mock test."
        trigger="mock_test_gate"
        initialMode="signin"
      />
    </>
  );
}

export async function getStaticPaths() {
  const mocks = await listMockTests();
  return { paths: mocks.map((mock) => ({ params: { slug: mock.slug } })), fallback: 'blocking' };
}

export async function getStaticProps({ params }) {
  const mock = await getMockTest(params.slug);
  if (!mock || mock.sections.length === 0) return { notFound: true };
  const publicMock = {
    id: mock.id,
    slug: mock.slug,
    title: mock.title,
    description: mock.description,
    skill: mock.skill,
    module: mock.module || null,
    durationSeconds: mock.durationSeconds,
    sectionCount: mock.sections.length,
  };
  return { props: { mock: publicMock }, revalidate: 3600 };
}
