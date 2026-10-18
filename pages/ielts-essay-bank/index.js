import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, Layers, PenLine, Sparkles } from 'lucide-react';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import AdUnit from '../../src/components/AdUnit';
import EssayBankBrowser from '../../src/components/essayBank/EssayBankBrowser';
import { Button } from '../../components/ui/button';
import { SITE_URL } from '../../lib/site';
import { formatBand, questionTypeLabel, taskLabel } from '../../lib/essayTaxonomy';
// Server-only modules: referenced ONLY inside getStaticProps, so Next strips
// them (and `fs`) from the client bundle.
import { essays as allEssays, toEssayCard } from '../../lib/essays';
import { buildCatalogue } from '../../lib/essayBankCatalogue';
import { listWritingModelAnswers } from '../../lib/supabase';

const CANONICAL = `${SITE_URL}/ielts-essay-bank`;

// Visible on-page Q&As; the FAQPage JSON-LD below is generated from this SAME
// array so the structured data never describes text a reader cannot see.
const FAQ = [
  {
    q: 'What is an IELTS essay bank?',
    a: 'An organised collection of Writing practice prompts paired with sample answers. Everything in this bank is original practice material written by IELTS-Bank — real IELTS test papers are confidential and never published, so any site claiming to offer them is not legitimate.',
  },
  {
    q: 'Why are some essays shown at Band 6, 7 and 8 for the same question?',
    a: 'Because the fastest way to understand the band descriptors is to see one question answered at three levels. Each version has criterion-by-criterion examiner-style comments that point to the exact sentences separating it from the next band.',
  },
  {
    q: 'Are the band scores official?',
    a: 'No. The bands are our assessment of each sample against the public IELTS Writing band descriptors, written to illustrate the standard. Only a certified examiner in a real test can award an official score.',
  },
  {
    q: 'Should I memorise these essays?',
    a: 'No. Examiners are trained to spot memorised language, and a prepared essay that does not answer the actual question fails Task Response. Write your own answer first, then compare it with a sample and borrow patterns and collocations — never whole paragraphs.',
  },
  {
    q: 'Can I get my own essay scored?',
    a: 'Yes. Every sample links to a practice page with the same prompt, where you can write your answer and get an AI band estimate. Your first Writing score is free after you create an account and shows your overall band and first criterion; Pro covers all four criteria.',
  },
];

// Condensed method for using the bank, by task (merged from the two retired
// blog guides that now redirect here).
const METHOD = [
  {
    title: 'Write first, compare second',
    body: 'Set a timer — 40 minutes for Task 2, 20 for Task 1 — and write your own answer before opening any sample. Comparison only teaches when you have committed to your own decisions first.',
  },
  {
    title: 'Audit like an examiner',
    body: 'Check your answer against the four criteria in turn: did you answer every part of the question, does each paragraph develop one idea, which collocations did the sample use that you did not, and where did your grammar break down?',
  },
  {
    title: 'Harvest patterns, not paragraphs',
    body: 'Take two or three reusable patterns per sample — a way of conceding a point, a precise collocation, a comparison structure for charts. Thirty phrases is a memorisation project in disguise.',
  },
  {
    title: 'Rewrite, then retest',
    body: 'Rewrite your weakest paragraph straight away, then try a fresh prompt within a week. The measure of progress is the next essay on a question you have never seen.',
  },
];

const TASK_TIPS = [
  {
    title: 'Task 2 essays',
    body: 'Put the question beside both essays and check every part is answered — both views, your opinion, both halves of a two-part question. Label what each paragraph does; watch how strong answers extend one idea over four or five sentences.',
  },
  {
    title: 'Task 1 Academic',
    body: 'Compare overviews first: a strong answer states the two or three main patterns without figures. Count how few numbers the sample actually quotes, and name the grouping logic behind its body paragraphs.',
  },
  {
    title: 'General Training letters',
    body: 'Check that every bullet point is developed, not just mentioned, and notice how the tone matches the reader — the same request is worded very differently to a friend, a landlord and a hotel manager.',
  },
];

function Section({ id, eyebrow, title, intro, children }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-10 sm:px-6 lg:px-8">
      {eyebrow ? <p className="text-xs font-bold uppercase tracking-wide text-accent">{eyebrow}</p> : null}
      <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      {intro ? <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">{intro}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function EssayBankPage({ essays, comparisonSets, catalogue, counts }) {
  const total = counts.essays + counts.catalogue;
  const title = `IELTS Essay Bank: ${total}+ Sample Essays with Band Scores (Task 1 & 2)`;
  const description = `Browse ${total}+ original IELTS Writing sample answers — Task 2 essays, Task 1 reports and GT letters — filtered by topic, question type and band, with Band 6 vs 7 vs 8 comparisons.`;
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent('IELTS Essay Bank')}&type=guide&subtitle=${encodeURIComponent(`${total}+ band-scored sample answers`)}`;

  const itemList = [
    ...essays.map((e) => ({ url: `${SITE_URL}/ielts-essay-bank/${e.slug}`, name: e.seoTitle })),
    ...catalogue.map((c) => ({ url: `${SITE_URL}/writingquestion/${c.slug}`, name: `${c.title} — Band 8–9 sample answer` })),
  ];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${CANONICAL}#page`,
        url: CANONICAL,
        name: 'IELTS Essay Bank',
        description,
        inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: 'IELTS-Bank', url: SITE_URL },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: itemList.length,
          itemListElement: itemList.map((item, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: item.url,
            name: item.name,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'IELTS Essay Bank', item: CANONICAL },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="IELTS Essay Bank — band-scored sample answers" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content="IELTS Essay Bank — band-scored sample answers" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-secondary/40">
        <Navbar />
        <main className="flex-1">
          {/* ============================ HERO ============================ */}
          <header className="border-b border-border bg-background">
            <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
              <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
                <NextLink href="/" className="no-underline hover:text-foreground">Home</NextLink>
                <span aria-hidden="true"> / </span>
                <span className="text-foreground">IELTS Essay Bank</span>
              </nav>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
                IELTS Essay Bank
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
                {total}+ original IELTS Writing sample answers — Task 2 essays, Academic Task 1 reports and
                General Training letters — each with a band score. Filter by task, topic, question type and band,
                then write your own answer to the same prompt and get it scored.
              </p>

              <div className="mt-6 max-w-3xl rounded-xl border border-accent/30 bg-accent/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">Quick answer</p>
                <p className="mt-2 leading-relaxed text-foreground">
                  This essay bank has {counts.catalogue} Band 8–9 model answers (one on every Writing practice
                  question) plus {counts.essays} examiner-style annotated samples that answer the same prompt at Band 6,
                  7 and 8, so you can see exactly what separates the bands. Write your answer first, compare it
                  criterion by criterion, then borrow patterns — not paragraphs.
                </p>
              </div>

              <dl className="mt-8 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ['Task 2 essays', counts.byTask['task2-academic'] + counts.byTask['task2-general']],
                  ['Task 1 reports', counts.byTask['task1-academic']],
                  ['GT letters', counts.byTask['task1-general']],
                  ['Band comparison sets', comparisonSets.length],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-card p-4">
                    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-2xl font-bold text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild variant="accent" size="lg">
                  <a href="#compare" className="no-underline">
                    <Layers className="h-4 w-4" aria-hidden="true" />
                    Compare Band 6 vs 7 vs 8
                  </a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="#browse" className="no-underline">Browse all sample answers</a>
                </Button>
              </div>
            </div>
          </header>

          {/* ===================== BAND COMPARISON SETS ===================== */}
          <Section
            id="compare"
            eyebrow="Same question, three levels"
            title="Band 6 vs Band 7 vs Band 8 sample essays"
            intro="Each prompt below is answered three times, at three different levels, with examiner-style comments on Task Response (or Task Achievement), Coherence and Cohesion, Lexical Resource and Grammatical Range and Accuracy. Read them in order to see what actually moves a score."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {comparisonSets.map((set) => (
                <article key={set.practice} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {taskLabel(set.bucket)} · {questionTypeLabel(set.type)}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-foreground">{set.title}</h3>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {set.essays.map((e) => (
                      <li key={e.slug}>
                        <NextLink
                          href={`/ielts-essay-bank/${e.slug}`}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground no-underline hover:border-accent hover:text-accent"
                        >
                          Band {formatBand(e.band)} sample
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </NextLink>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </Section>

          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <AdUnit />
          </div>

          {/* ========================= FULL BANK ========================= */}
          <Section
            id="browse"
            eyebrow="The full bank"
            title="Browse every IELTS sample answer"
            intro="Filter by task, topic family, question type and band. Band 8–9 model answers open on their practice page, where the same prompt is ready for you to answer and score."
          >
            <EssayBankBrowser essays={essays} catalogue={catalogue} />
          </Section>

          {/* ======================== HOW TO USE ======================== */}
          <Section
            id="how-to-use"
            eyebrow="Method"
            title="How to use an IELTS essay bank properly"
            intro="Reading twenty model essays feels productive and teaches almost nothing. Used as a training system, an essay bank is the most efficient Writing practice there is."
          >
            <ol className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {METHOD.map((step, i) => (
                <li key={step.title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <p className="text-sm font-bold text-accent">Step {i + 1}</p>
                  <h3 className="mt-1 text-base font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {TASK_TIPS.map((tip) => (
                <div key={tip.title} className="rounded-xl border border-border bg-background p-5">
                  <h3 className="text-base font-semibold text-foreground">{tip.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{tip.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm leading-6 text-muted-foreground">
              Going deeper: the{' '}
              <NextLink href="/ielts-band-descriptors" className="font-medium text-accent underline underline-offset-2">
                IELTS band descriptors explained
              </NextLink>
              , the{' '}
              <NextLink href="/blog/ielts-writing-band-6-to-band-7" className="font-medium text-accent underline underline-offset-2">
                Band 6 to Band 7 Writing guide
              </NextLink>{' '}
              and the{' '}
              <NextLink href="/ielts-writing-task-2-topics" className="font-medium text-accent underline underline-offset-2">
                Task 2 topics list
              </NextLink>
              .
            </p>
          </Section>

          {/* ============================ CTA ============================ */}
          <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-5 rounded-2xl border border-accent/30 bg-accent/5 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-accent">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Your turn
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                  Write your own answer and get an AI band score
                </h2>
                <p className="mt-2 text-base leading-7 text-muted-foreground">
                  Paste any Task 1 or Task 2 answer into the Writing Checker for a band estimate on all four
                  criteria, with corrections. Your first Writing score is free after you create an account.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3">
                <Button asChild variant="accent" size="lg">
                  <NextLink href="/ielts-writing-checker" className="no-underline">
                    <PenLine className="h-4 w-4" aria-hidden="true" />
                    Open the Writing Checker
                  </NextLink>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <NextLink href="/writingquestion" className="no-underline">Practice questions</NextLink>
                </Button>
              </div>
            </div>
          </section>

          {/* ============================ FAQ ============================ */}
          <Section id="faq" title="IELTS essay bank FAQ">
            <div className="space-y-4">
              {FAQ.map((item) => (
                <div key={item.q} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-foreground">{item.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
              All prompts and sample answers in this essay bank are original practice material written by
              IELTS-Bank. They are not official IELTS materials and are not taken from real tests. IELTS-Bank is an
              independent study resource and is not affiliated with, endorsed by, or connected to the British
              Council, IDP: IELTS Australia, or Cambridge University Press &amp; Assessment. &quot;IELTS&quot; is a
              registered trademark of its respective owners and is used here for descriptive purposes only.
            </p>
          </Section>
        </main>
        <Footer />
      </div>
    </>
  );
}

export async function getStaticProps() {
  const essays = allEssays.map(toEssayCard);

  // Group the authored essays by prompt; a set with more than one band is a
  // comparison set, ordered by band so it reads as a progression.
  const byPractice = new Map();
  allEssays.forEach((e) => {
    const set = byPractice.get(e.practice) || {
      practice: e.practice,
      title: e.title,
      bucket: e.bucket,
      type: e.type,
      essays: [],
    };
    set.essays.push({ slug: e.slug, band: e.band });
    byPractice.set(e.practice, set);
  });
  const comparisonSets = [...byPractice.values()]
    .filter((set) => set.essays.length > 1)
    .map((set) => ({ ...set, essays: set.essays.sort((a, b) => a.band - b.band) }));

  // The Band 8–9 model answers already on the practice pages. A Supabase
  // outage must not take the hub down: fall back to the authored essays only
  // and let the hourly revalidation fill the catalogue back in.
  let catalogue = [];
  try {
    catalogue = buildCatalogue(await listWritingModelAnswers());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('ielts-essay-bank: failed to load writing model answers', err);
  }

  const byTask = { 'task2-academic': 0, 'task2-general': 0, 'task1-academic': 0, 'task1-general': 0 };
  [...essays, ...catalogue].forEach((item) => {
    byTask[item.bucket] += 1;
  });

  return {
    props: {
      essays,
      comparisonSets,
      catalogue,
      counts: { essays: essays.length, catalogue: catalogue.length, byTask },
    },
    revalidate: 3600,
  };
}
