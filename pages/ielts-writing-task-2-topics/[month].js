import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowLeft, ArrowRight, CalendarCheck, PenLine, Sparkles } from 'lucide-react';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import { SITE_URL } from '../../lib/site';
import { TASK2_PROMPTS } from '../../lib/task2Prompts';
import {
  buildMonthlyRoundup,
  isPublishableMonth,
  listRoundupMonths,
  parseMonthSlug,
} from '../../lib/task2Roundup';
import { monthlyTask2Seo, TASK2_TOPICS_PATH } from '../../lib/task2TopicsSeo';

// How the page describes itself, per roundup `source`. The wording is the whole
// point of the fallback: a month with no new prompts still gets a useful page,
// but it must SAY that nothing new landed rather than implying freshness.
const SOURCE_COPY = {
  new: {
    badge: 'New this month',
    lede: (n, label) =>
      `${n} Writing Task 2 practice questions were added to the question bank in ${label}. They are grouped below by essay frame, because the frame — not the topic — decides what structure your essay needs.`,
  },
  mixed: {
    badge: 'New this month',
    lede: (n, label) =>
      `${n} Writing Task 2 practice questions were added to the question bank in ${label}, listed below alongside recent additions so there is a full set to practise from. New arrivals are marked.`,
  },
  recent: {
    badge: 'Recently added',
    lede: (_n, label) =>
      `No new Task 2 prompts were added to the question bank in ${label}, so this roundup lists the most recently added questions instead. They are grouped by essay frame, because the frame — not the topic — decides what structure your essay needs.`,
  },
};

function PromptList({ prompts }) {
  return (
    <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {prompts.map((prompt) => (
        <li key={prompt.slug} className="list-none">
          <NextLink
            href={`/writingquestion/${prompt.slug}`}
            className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
          >
            <span>
              {prompt.title}
              {prompt.module === 'general' ? (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  General
                </span>
              ) : null}
              {prompt.isNew ? (
                <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
                  New
                </span>
              ) : null}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </NextLink>
        </li>
      ))}
    </ul>
  );
}

export default function Task2MonthlyRoundup({ roundup, seo, otherMonths }) {
  const copy = SOURCE_COPY[roundup.source];
  const { month } = roundup;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `IELTS Writing Task 2 topics — ${month.label}`,
    description: seo.description,
    url: seo.canonical,
    // Honest freshness: the newest real timestamp behind the listed prompts,
    // never simply "today" for an archived month. See lib/task2Roundup.js.
    dateModified: roundup.dateModified,
    isPartOf: { '@type': 'WebPage', '@id': `${SITE_URL}${TASK2_TOPICS_PATH}` },
    hasPart: roundup.groups.flatMap((group) =>
      group.prompts.map((prompt) => ({
        '@type': 'CreativeWork',
        name: prompt.title,
        url: `${SITE_URL}/writingquestion/${prompt.slug}`,
        genre: group.frame.name,
      }))
    ),
  };

  return (
    <>
      <Head>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <meta name="robots" content="index, follow" />
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <NextLink
              href={TASK2_TOPICS_PATH}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:text-accent/80"
            >
              <ArrowLeft className="h-4 w-4" />
              All Task 2 topics
            </NextLink>

            <header className="mb-8 mt-6 max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                <Sparkles className="h-3.5 w-3.5" />
                {copy.badge}
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                IELTS Writing Task 2 Topics: {month.label}
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarCheck className="h-4 w-4" />
                Updated {month.label}
              </p>

              {/* Answer capsule — the direct answer first. */}
              <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  Quick answer
                </p>
                <p className="mt-2 leading-relaxed text-foreground">
                  {copy.lede(roundup.addedThisMonthCount, month.label)} Every question below is an
                  original IELTS-style prompt written for IELTS-Bank — nobody can tell you what will
                  appear in your test, so the useful preparation is to write one essay from each
                  frame until none of them is unfamiliar.
                </p>
              </div>
            </header>

            {roundup.groups.map((group) => (
              <section key={group.frame.id} className="mb-10">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  {group.frame.name}
                  <span className="ml-2 text-base font-medium text-muted-foreground">
                    ({group.prompts.length})
                  </span>
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">{group.frame.typicalWording}</span>{' '}
                  {group.frame.howToAnswer}
                </p>
                <PromptList prompts={group.prompts} />
              </section>
            ))}

            <section className="mb-10 rounded-2xl bg-slate-950 p-6 text-white sm:p-8">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                  <PenLine className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-bold">Write one, then get it scored</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Pick a frame you find hardest, write a full 250-word answer in 40 minutes, then
                    try your first AI Writing sample score free to see which of the four criteria is
                    holding your band down.
                  </p>
                  <NextLink
                    href="/ielts-writing-checker?source=task2_monthly"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white no-underline hover:bg-emerald-400"
                  >
                    Check my essay <ArrowRight className="h-4 w-4" />
                  </NextLink>
                </div>
              </div>
            </section>

            {otherMonths.length ? (
              <section className="rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Other monthly roundups
                </h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {otherMonths.map((other) => (
                    <NextLink
                      key={other.slug}
                      href={`${TASK2_TOPICS_PATH}/${other.slug}`}
                      className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground no-underline shadow-sm hover:border-accent/40 hover:text-accent"
                    >
                      {other.label}
                    </NextLink>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}

export async function getStaticPaths() {
  return {
    // Pre-render the trailing six months. `blocking` keeps the route alive when
    // the calendar rolls over between deploys: getStaticProps re-validates the
    // slug and 404s anything that is not a real, non-future month.
    paths: listRoundupMonths(new Date(), 6).map((month) => ({ params: { month } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const slug = params.month;
  if (!parseMonthSlug(slug) || !isPublishableMonth(slug)) return { notFound: true };

  const roundup = buildMonthlyRoundup(TASK2_PROMPTS, slug);
  if (!roundup || !roundup.groups.length) return { notFound: true };

  const otherMonths = listRoundupMonths(new Date(), 6)
    .filter((other) => other !== roundup.month.slug)
    .map((other) => parseMonthSlug(other));

  return {
    props: {
      roundup,
      seo: monthlyTask2Seo(roundup.month, roundup.totalCount),
      otherMonths,
    },
    // The catalogue only changes on deploy, but a daily revalidate means the
    // "current month" page exists the day the calendar turns over.
    revalidate: 60 * 60 * 24,
  };
}
