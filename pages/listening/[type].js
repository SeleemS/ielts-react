import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, Inbox, Target, ListChecks, AlertTriangle, Clock } from 'lucide-react';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import { Button } from '../../components/ui/button';
import { listPassagesByListeningPart } from '../../lib/supabase';
import {
  getListeningPartSeo,
  LISTENING_PARTS,
  LISTENING_PART_SLUGS,
} from '../../lib/listeningQuestionTypes';

import { SITE_URL } from '../../lib/site';

const DIFFICULTY_STYLES = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  hard: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
};
// Visible freshness for the strategy guides — bump when guide prose changes.
const GUIDE_UPDATED = 'August 2026';

const DIFFICULTY_FALLBACK =
  'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20';

function DifficultyBadge({ difficulty }) {
  if (!difficulty) return null;
  const style = DIFFICULTY_STYLES[String(difficulty).toLowerCase()] || DIFFICULTY_FALLBACK;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style}`}
    >
      {difficulty}
    </span>
  );
}

export default function ListeningPartHub({ typeKey, items }) {
  const config = LISTENING_PARTS[typeKey];
  const { label, h1, title, description, guide } = config;
  const seo = getListeningPartSeo(typeKey);
  const { canonical } = seo;

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Listening', item: `${SITE_URL}/listeningquestion` },
      { '@type': 'ListItem', position: 3, name: label, item: canonical },
    ],
  };

  const otherParts = LISTENING_PART_SLUGS.filter((s) => s !== typeKey);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={seo.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={seo.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={seo.ogImage} />
        <meta name="twitter:image:alt" content={seo.imageAlt} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
              <NextLink href="/" className="no-underline hover:text-accent">
                Home
              </NextLink>
              <span className="px-1.5">/</span>
              <NextLink href="/listeningquestion" className="no-underline hover:text-accent">
                Listening
              </NextLink>
              <span className="px-1.5">/</span>
              <span className="text-foreground">{label}</span>
            </nav>

            <header className="mb-8 max-w-2xl">
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{h1}</h1>
              {/* Answer capsule: the 1-2 sentence direct answer, above the fold —
                  the strongest common trait of passages AI assistants cite. */}
              {guide.answer ? (
                <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">Quick answer</p>
                  <p className="mt-1 leading-relaxed text-foreground">{guide.answer}</p>
                </div>
              ) : null}
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{guide.intro}</p>
              <p className="mt-2 text-sm text-muted-foreground">Updated {GUIDE_UPDATED}</p>
            </header>

            {/* ===================== STRATEGY GUIDE ===================== */}
            <article className="mb-12 space-y-8">
              <section>
                <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                  <Target className="h-5 w-5 text-accent" />
                  What does Listening {label} test?
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">{guide.tests}</p>
              </section>

              <section>
                <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                  <ListChecks className="h-5 w-5 text-accent" />
                  How do you approach Listening {label}?
                </h2>
                <ol className="mt-3 space-y-3">
                  {guide.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                  <AlertTriangle className="h-5 w-5 text-accent" />
                  What are the common traps to avoid?
                </h2>
                <ul className="mt-3 space-y-2">
                  {guide.traps.map((trap, i) => (
                    <li key={i} className="flex gap-3 leading-relaxed text-muted-foreground">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      {trap}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                  <Clock className="h-5 w-5 text-accent" />
                  How should you manage the timing?
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">{guide.timing}</p>
              </section>
            </article>

            {/* ===================== RECORDING LIST ===================== */}
            <section className="mb-12">
              <h2 className="mb-4 text-2xl font-bold tracking-tight text-foreground">
                Practise {label} recordings
              </h2>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center shadow-sm">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Inbox className="h-6 w-6" />
                  </span>
                  <p className="text-base font-semibold text-foreground">No recordings yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    We are adding more {label} recordings. In the meantime, browse the full{' '}
                    <NextLink href="/listeningquestion" className="font-semibold text-accent no-underline">
                      Listening question bank
                    </NextLink>
                    .
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          {/* Hidden on mobile so Title/Difficulty/Action fit 375px
                              without sideways scrolling (matches DataTable). */}
                          <th className="hidden w-14 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell sm:px-6">
                            #
                          </th>
                          <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-4">
                            Title
                          </th>
                          <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-4">
                            Difficulty
                          </th>
                          <th className="px-2 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-6">
                            <span className="sr-only">Action</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => {
                          const routeId = item.legacyId || item.id;
                          const href = `/listeningquestion/${encodeURIComponent(routeId)}`;
                          return (
                            <tr
                              key={item.id}
                              className="group border-b border-border transition-colors last:border-b-0 hover:bg-secondary/60"
                            >
                              <td className="hidden px-4 py-4 align-middle text-sm font-medium tabular-nums text-muted-foreground sm:table-cell sm:px-6">
                                {index + 1}
                              </td>
                              <td className="px-3 py-4 align-middle sm:px-4">
                                <NextLink
                                  href={href}
                                  className="text-sm font-semibold text-foreground no-underline transition-colors hover:text-accent"
                                >
                                  {item.title}
                                </NextLink>
                              </td>
                              <td className="px-2 py-4 align-middle sm:px-4">
                                <DifficultyBadge difficulty={item.difficulty} />
                              </td>
                              <td className="px-2 py-4 text-right align-middle sm:px-6">
                                <Button asChild size="sm" variant="ghost" className="text-accent hover:text-accent">
                                  <NextLink href={href} className="no-underline">
                                    Practise
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                  </NextLink>
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* ===================== CROSS-LINKS ===================== */}
            <section className="rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Practise the other listening parts
              </h2>
              <div className="mt-5 flex flex-wrap gap-2.5">
                {otherParts.map((slug) => (
                  <NextLink
                    key={slug}
                    href={`/listening/${slug}`}
                    className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    Listening {LISTENING_PARTS[slug].label}
                  </NextLink>
                ))}
                <NextLink
                  href="/listeningquestion"
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent no-underline transition-colors hover:bg-accent/20"
                >
                  All listening recordings
                  <ArrowRight className="h-4 w-4" />
                </NextLink>
              </div>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}

export async function getStaticPaths() {
  return {
    paths: LISTENING_PART_SLUGS.map((type) => ({ params: { type } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const typeKey = params.type;
  const config = LISTENING_PARTS[typeKey];
  if (!config) return { notFound: true };

  let items = [];
  try {
    items = await listPassagesByListeningPart(config.part);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[listening/${typeKey}] Falling back to empty list:`, err?.message || err);
    items = [];
  }

  return { props: { typeKey, items }, revalidate: 3600 };
}
