import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import {
  ArrowRight,
  BookOpen,
  PenLine,
  Headphones,
  Mic,
  CheckCircle2,
  Sparkles,
  FileCheck2,
  Timer,
  Gauge,
  GraduationCap,
  ClipboardList,
  BarChart3,
  Star,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import NewsletterSignup from '../components/NewsletterSignup';
import { track } from '../lib/analytics';
import DashboardTeaser from '../components/home/DashboardTeaser';

import { SITE_URL } from '../../lib/site';
const OG_IMAGE = `${SITE_URL}/api/og?title=${encodeURIComponent(
  'Master IELTS with real, auto-scored practice'
)}&type=home`;
// Kept under 70 characters — longer titles get truncated or rewritten by
// search engines (flagged by Bing Webmaster Tools at 74).
const PAGE_TITLE = 'IELTS-Bank — Free IELTS Practice Tests with AI Band Feedback';
const PAGE_DESCRIPTION =
  'Practise IELTS Reading, Writing, Listening and Speaking with authentic-style questions, instant scoring and AI-powered band feedback.';

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'IELTS-Bank',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo512.png`,
        width: 512,
        height: 512,
      },
      description:
        'Free IELTS practice platform: auto-scored Reading, Writing, Listening and Speaking questions with AI band feedback and full-length mock tests.',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'IELTS-Bank',
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'en',
    },
  ],
};

const fmt = (n) =>
  typeof n === 'number' && n > 0 ? `${n.toLocaleString('en-US')}+` : '—';

// Historical usage predates the current Supabase activity counter. Keep the
// public total at this baseline until live tracked answers surpass it.
const QUESTIONS_ANSWERED_BASELINE = 73000;

function Skills(counts) {
  return [
    {
      key: 'reading',
      title: 'Reading',
      href: '/readingquestion',
      icon: BookOpen,
      count: counts.reading,
      blurb:
        'Authentic-style academic passages with True/False/Not Given, matching and short-answer questions — timed and auto-scored.',
      available: true,
    },
    {
      key: 'writing',
      title: 'Writing',
      href: '/writingquestion',
      icon: PenLine,
      count: counts.writing,
      blurb:
        'Task 1 and Task 2 prompts with Band 8–9 model answers, examiner-style rationales and instant AI feedback across the official criteria.',
      available: true,
    },
    {
      key: 'listening',
      title: 'Listening',
      href: '/listeningquestion',
      icon: Headphones,
      count: counts.listening,
      blurb:
        'Real audio recordings with form-completion, multiple-choice and matching questions and an instant answer key.',
      available: true,
    },
    {
      key: 'speaking',
      title: 'Speaking',
      href: '/speakingquestion',
      icon: Mic,
      count: counts.speaking,
      blurb:
        'Part 1–3 questions and cue cards with an examiner voice. Record your answer and get instant AI band feedback.',
      available: true,
    },
  ];
}

const FEATURES = [
  {
    icon: Gauge,
    title: 'Instant auto-scoring',
    desc: 'Submit your answers and get scored immediately, with the correct answer revealed for every question.',
  },
  {
    icon: FileCheck2,
    title: 'Evidence-based review',
    desc: 'Review correct answers and use detailed AI feedback to improve structure, vocabulary and accuracy.',
  },
  {
    icon: Sparkles,
    title: 'AI Writing & Speaking feedback',
    desc: 'Get instant, criterion-by-criterion band scores and detailed feedback on your Writing essays and recorded Speaking answers.',
  },
  {
    icon: Star,
    title: 'Free core practice',
    desc: 'Open any question and start practising without an account. All Reading and Listening practice is free forever — Premium unlocks AI Writing and Speaking scoring.',
  },
];

const STEPS = [
  {
    icon: ClipboardList,
    title: 'Pick a skill',
    desc: 'Choose Reading, Writing, Listening or Speaking and select any question from the bank.',
  },
  {
    icon: Timer,
    title: 'Practise under test conditions',
    desc: 'Work through the questions with a built-in timer, just like the real exam.',
  },
  {
    icon: BarChart3,
    title: 'Get scored instantly',
    desc: 'See your score, review correct answers and get actionable feedback on what to improve next.',
  },
];

const HomePage = ({ counts = {} }) => {
  const skills = Skills(counts);

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <meta
          name="keywords"
          content="IELTS, IELTS Bank, ielts bank, ielts practice, IELTS Reading, IELTS Writing, IELTS Listening, IELTS Practice Questions, IELTS Test Prep"
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`${SITE_URL}/`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={`${SITE_URL}/`} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta
          property="og:image:alt"
          content="IELTS-Bank — free IELTS Reading, Writing, Listening and Speaking practice"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta
          name="twitter:image:alt"
          content="IELTS-Bank — free IELTS Reading, Writing, Listening and Speaking practice"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />

        <main className="flex-1">
          {/* ============================ HERO ============================ */}
          <section className="relative overflow-hidden border-b border-border bg-primary text-primary-foreground">
            {/* subtle radial glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{
                background:
                  'radial-gradient(600px circle at 20% 0%, hsl(160 84% 39% / 0.18), transparent 45%), radial-gradient(700px circle at 90% 20%, hsl(160 84% 39% / 0.10), transparent 40%)',
              }}
            />
            <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
              <div className="mx-auto max-w-3xl text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-emerald-300">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Trusted free IELTS practice
                </span>
                <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                  Master IELTS with real,
                  <br className="hidden sm:block" />
                  <span className="text-emerald-400"> auto-scored practice</span>
                </h1>
                <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-200">
                  Practise authentic-style Reading, Writing, Listening and Speaking,
                  get instant auto-scoring, and receive AI band feedback on your essays
                  and recordings.
                </p>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button asChild variant="accent" size="lg" className="w-full sm:w-auto">
                    <NextLink href="/readingquestion" className="no-underline">
                      Start practicing
                      <ArrowRight className="h-4 w-4" />
                    </NextLink>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="w-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto"
                  >
                    <NextLink href="/blog" className="no-underline">
                      Read study tips
                    </NextLink>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="w-full border-emerald-300/40 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20 hover:text-white sm:w-auto"
                  >
                    <NextLink href="/band-estimator" className="no-underline">
                      Estimate my band
                    </NextLink>
                  </Button>
                </div>
              </div>

              {/* Credibility strip */}
              <div className="mx-auto mt-16 grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-5">
                {[
                  {
                    label: 'Questions answered',
                    value: fmt(
                      Math.max(QUESTIONS_ANSWERED_BASELINE, counts.questionsAnswered || 0)
                    ),
                  },
                  { label: 'Questions in bank', value: fmt(counts.questions) },
                  { label: 'Writing tasks', value: fmt(counts.writing) },
                  { label: 'Listening tests', value: fmt(counts.listening) },
                  { label: 'Speaking topics', value: fmt(counts.speaking) },
                ].map((stat) => (
                  <div key={stat.label} className="bg-primary px-6 py-6 text-center">
                    <div className="text-3xl font-extrabold text-white">{stat.value}</div>
                    <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-300">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ========================= FOUR SKILLS ========================= */}
          <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="emerald">Four skills, one platform</Badge>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Practise every part of the exam
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Focused question banks for each IELTS skill, built to mirror the real test format.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {skills.map((skill) => {
                const Icon = skill.icon;
                const card = (
                  <Card
                    className={
                      'group h-full transition-all ' +
                      (skill.available
                        ? 'hover:-translate-y-1 hover:border-accent/40 hover:shadow-md'
                        : 'opacity-90')
                    }
                  >
                    <CardContent className="flex h-full flex-col p-6">
                      <div className="flex items-center justify-between">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
                          <Icon className="h-5 w-5" />
                        </span>
                        {skill.available ? (
                          <Badge variant="secondary" className="tabular-nums">
                            {fmt(skill.count)}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Coming soon</Badge>
                        )}
                      </div>
                      <h3 className="mt-5 text-xl font-bold text-foreground">{skill.title}</h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                        {skill.blurb}
                      </p>
                      <span
                        className={
                          'mt-5 inline-flex items-center gap-1.5 text-sm font-semibold ' +
                          (skill.available ? 'text-accent' : 'text-muted-foreground')
                        }
                      >
                        {skill.available ? 'Start practising' : 'In development'}
                        {skill.available && (
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        )}
                      </span>
                    </CardContent>
                  </Card>
                );

                return skill.available ? (
                  <NextLink key={skill.key} href={skill.href} className="no-underline">
                    {card}
                  </NextLink>
                ) : (
                  <div key={skill.key}>{card}</div>
                );
              })}
            </div>
          </section>

          {/* ==================== ACCOUNT DASHBOARD ==================== */}
          <DashboardTeaser />

          {/* ====================== WHY IELTS-BANK ====================== */}
          <section className="border-y border-border bg-secondary/50">
            <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-2xl text-center">
                <Badge variant="emerald">Why IELTS-Bank</Badge>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Everything you need to raise your band
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  Built by test-takers, for test-takers — practical tools that map directly to how IELTS is scored.
                </p>
              </div>

              <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {FEATURES.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <Card key={feature.title} className="h-full">
                      <CardContent className="p-6">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                          <Icon className="h-5 w-5" />
                        </span>
                        <h3 className="mt-5 text-base font-bold text-foreground">{feature.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {feature.desc}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ==================== FREE vs PRO STRIP ===================== */}
          {/* The homepage is the top landing page but previously had no path
              to Pricing beyond the navbar link. One honest strip, no hard
              sell: what stays free, what Pro adds, one CTA. */}
          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:flex-row lg:justify-between">
              <div className="grid flex-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Free forever
                  </p>
                  <p className="mt-1.5 text-sm text-foreground">
                    The full Reading &amp; Listening bank with instant marking, plus one free AI
                    Writing and one Speaking sample score.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-accent">
                    IELTS-Bank Pro
                  </p>
                  <p className="mt-1.5 text-sm text-foreground">
                    Full AI Writing reports, Speaking scoring, a live AI examiner, timed mocks
                    and band trends — with a 14-day money-back guarantee.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" className="shrink-0">
                <NextLink
                  href="/pricing"
                  className="no-underline"
                  onClick={() => track('product_cta_click', { source: 'homepage_pro_strip', product: 'pricing' })}
                >
                  Compare Free vs Pro
                  <ArrowRight className="h-4 w-4" />
                </NextLink>
              </Button>
            </div>
          </section>

          {/* ======================= HOW IT WORKS ======================= */}
          <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="emerald">How it works</Badge>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Practise in three simple steps
              </h2>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="relative flex flex-col items-center text-center">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-accent">
                      <Icon className="h-7 w-7" />
                      <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {i + 1}
                      </span>
                    </div>
                    <h3 className="mt-6 text-lg font-bold text-foreground">{step.title}</h3>
                    <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                      {step.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ========================= FINAL CTA ========================= */}
          <section className="mx-auto max-w-3xl px-4 pb-12 sm:px-6 lg:px-8">
            <NewsletterSignup source="homepage" />
          </section>
          <section className="px-4 pb-20 sm:px-6 lg:px-8">
            <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-border bg-primary px-6 py-16 text-center text-primary-foreground sm:px-12">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(500px circle at 50% -10%, hsl(160 84% 39% / 0.22), transparent 60%)',
                }}
              />
              <div className="relative mx-auto max-w-2xl">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Ready to boost your IELTS score?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-lg text-slate-200">
                  Jump into a real practice question right now — it is free, and you do not
                  need an account.
                </p>
                <ul className="mx-auto mt-8 flex max-w-xl flex-col items-start gap-3 text-left sm:flex-row sm:items-center sm:justify-center sm:gap-8">
                  {['Practice freely', 'Instant scoring', 'AI band feedback'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm font-medium text-slate-100">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-9">
                  <Button asChild variant="accent" size="lg">
                    <NextLink href="/readingquestion" className="no-underline">
                      Start practicing now
                      <ArrowRight className="h-4 w-4" />
                    </NextLink>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default HomePage;
