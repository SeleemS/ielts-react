import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { freeScoreCopy } from '../lib/freeScorePeriod';
import { EXAM_PASS_DAYS } from '../src/lib/saleConfig';
import {
  Sparkles,
  PenLine,
  Gauge,
  MessageSquareText,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Wand2,
  ListChecks,
} from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import NewsletterSignup from '../src/components/NewsletterSignup';
import { Button } from '../components/ui/button';
import { track } from '../src/lib/analytics';
import SampleReportPreview from '../src/components/SampleReportPreview';
import ScoringExplainer from '../src/components/ScoringExplainer';
import WritingCheckerTool from '../src/components/writingChecker/WritingCheckerTool';

import {
  WRITING_CHECKER_SEO,
  WRITING_CHECKER_TASK_LINKS,
  buildWritingCheckerAppJsonLd,
} from '../lib/writingCheckerSeo';

const CANONICAL = WRITING_CHECKER_SEO.canonical;
// Analytics identifier for this tool (there is no passage row behind it).
const CHECKER_SLUG = 'writing-checker';

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
    a: `Yes, your first AI Writing score is free after you create an account. It shows your overall band, your Task Response (or Task Achievement) band with feedback, and one corrected example. The ${EXAM_PASS_DAYS}-day Exam Pass adds continued scoring with full reports, examiner summaries, improvement plans and all corrections for newly saved reports and your next essays.`,
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

export default function WritingCheckerPage() {
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildWritingCheckerAppJsonLd()).replace(/</g, '\\u003c'),
          }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />

        <main className="flex-1">
          {/* Hero */}
          <section className="border-b border-border bg-secondary/40">
            <div className="mx-auto max-w-4xl px-4 py-8 text-center sm:px-6 sm:py-12 md:py-16 lg:px-8">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                AI-powered tool
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                AI IELTS Writing Checker
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Paste a Task 1 or Task 2 answer. In under a minute you get a band on each of
                the four official criteria and the sentences holding your score back.
                {freeScoreCopy().checkerFreeLine}
              </p>
              <ul className="mx-auto mt-5 hidden max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-foreground sm:flex">
                {['Free first report — no card', 'Marked on the public band descriptors', 'Your draft is saved while you sign up'].map((item) => (
                  <li key={item} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="#sample-report"
                className="mt-4 inline-block text-sm font-semibold text-accent underline underline-offset-4"
              >
                See a sample report first
              </a>
            </div>
          </section>

          {/* Tool */}
          <WritingCheckerTool variant="main" />

          {/* Task-specific checkers */}
          <section className="border-t border-border" aria-labelledby="checkers-by-task">
            <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
              <h2 id="checkers-by-task" className="text-center text-2xl font-bold tracking-tight text-foreground">
                Checkers for each Writing task
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
                Each task is marked differently. These pages explain what the checker looks for in
                that task, with the common mistakes and sample answers to compare against.
              </p>
              <ul className="mt-8 grid gap-4 sm:grid-cols-3">
                {WRITING_CHECKER_TASK_LINKS.map((link) => (
                  <li key={link.href} className="list-none">
                    <NextLink
                      href={link.href}
                      className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 no-underline shadow-sm transition-colors hover:border-accent/40"
                    >
                      <span className="text-base font-bold text-foreground group-hover:text-accent">{link.label}</span>
                      <span className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{link.blurb}</span>
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                        Open checker <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </NextLink>
                  </li>
                ))}
              </ul>
            </div>
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

          {/* Sample report — tagged Free vs Pro so nobody is surprised by a lock */}
          <SampleReportPreview className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <Button asChild variant="accent" size="lg" className="w-full sm:w-auto">
                <a href="#check" className="no-underline" onClick={() => track('sample_report_cta_click', { source: CHECKER_SLUG })}>
                  Check my essay free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                Pro is a {EXAM_PASS_DAYS}-day Exam Pass or a monthly plan ·{' '}
                <NextLink href="/pricing" className="font-semibold text-accent">see prices</NextLink>
              </p>
            </div>
          </SampleReportPreview>

          <section className="border-t border-border bg-secondary/30 px-4 py-14 sm:px-6 lg:px-8">
            <ScoringExplainer />
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

    </>
  );
}
