import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from './Navbar';
import Footer from './Footer';
import DataTable from './DataTable';
import { availableReadingTypeLinks } from '../../lib/readingQuestionTypes';

// Pure Tailwind/shadcn section landing. NO Chakra imports.
//
// Shared UI for the three section index pages (Reading / Writing / Listening).
// Renders SEO head, the Tailwind Navbar + Footer, a heading/intro, and the
// DataTable question browser fed the pre-fetched list from getStaticProps.

import { SITE_URL } from '../../lib/site';

// Per-skill FAQs: rendered visibly below the question list AND emitted as
// FAQPage JSON-LD (schema must always match visible content). Written to
// answer the questions searchers and AI assistants actually ask.
export const SECTION_FAQS = {
  reading: [
    {
      q: 'Is IELTS-Bank reading practice free?',
      a: 'Yes. Try one reading passage with instant marking, answer explanations and an estimated band without an account. Create a free account to submit more passages and save your progress across devices.',
    },
    {
      q: 'Are these real IELTS past papers?',
      a: 'They are original passages written to match the real test — the same question types (True/False/Not Given, matching, completion, multiple choice), length and difficulty — not leaked past papers, which are never legally available.',
    },
    {
      q: 'How is my reading band score estimated?',
      a: 'Your raw score is converted using the public IELTS band conversion tables, scaled to the number of questions in the set. Academic and General Training use different tables, and the estimate is a guide rather than an official score.',
    },
    {
      q: 'What is the difference between Academic and General Training reading?',
      a: 'Academic reading uses three long academic texts, while General Training mixes everyday notices, workplace documents and one longer text. General Training requires more correct answers for the same band.',
    },
  ],
  writing: [
    {
      q: 'How does the AI writing feedback work?',
      a: 'Your essay is scored against the four official IELTS criteria — Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy — with per-criterion strengths, improvements and corrected sentences from your own writing.',
    },
    {
      q: 'How accurate is the AI band score?',
      a: 'It is an estimate marked against the public IELTS band descriptors. Treat it as a guide within about half a band, and focus on the per-criterion feedback, which shows exactly what to fix.',
    },
    {
      q: 'Do the prompts include model answers?',
      a: 'Yes — prompts include a Band 8–9 model answer you can reveal after writing your own attempt, so you can compare structure, vocabulary and ideas.',
    },
    {
      q: 'Does it cover both Task 1 and Task 2?',
      a: 'Yes. There are Academic Task 1 prompts with charts and diagrams, General Training letters, and a large bank of Task 2 essay questions across common topics.',
    },
  ],
  listening: [
    {
      q: 'Can I replay the listening audio?',
      a: 'While practising you can replay, pause and skip back as often as you like. Remember that in the real exam the recording plays once only.',
    },
    {
      q: 'Do the recordings have transcripts?',
      a: 'Yes. After you submit your answers, the full transcript is available so you can check exactly what you missed, alongside explanations for every answer.',
    },
    {
      q: 'What listening question types are covered?',
      a: 'Form and note completion, multiple choice, matching, and map/plan labelling — the same mix as Parts 1 to 4 of the real test, with all four parts represented.',
    },
    {
      q: 'How is my listening band estimated?',
      a: 'Your raw score is converted with the public IELTS listening band table, scaled to the number of questions in the set. The same table applies to Academic and General Training.',
    },
  ],
  speaking: [
    {
      q: 'How does IELTS speaking practice work here?',
      a: 'You hear real examiner-style audio questions, record your answers in the browser, and can get AI feedback with an estimated band on Fluency and Coherence, Lexical Resource, and Grammatical Range and Accuracy.',
    },
    {
      q: 'Which parts of the speaking test are covered?',
      a: 'All three: Part 1 interview questions, Part 2 cue cards with a one-minute preparation timer, and Part 3 discussion questions.',
    },
    {
      q: 'Is pronunciation assessed?',
      a: 'The AI transcript scoring covers three of the four criteria and is honest that pronunciation is not AI-assessed. Premium includes live AI examiner interviews for real-time speaking practice.',
    },
    {
      q: 'Is speaking practice free?',
      a: 'Practising with examiner audio and recording yourself is free. AI feedback and band scores are part of Premium.',
    },
  ],
};

// Reusable visible FAQ accordion (shared with the custom speaking index page).
export function FaqSection({ faqs }) {
  if (!faqs?.length) return null;
  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        Frequently asked questions
      </h2>
      <div className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
        {faqs.map(({ q, a }) => (
          <details key={q} className="group px-5 py-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-3">
                {q}
                <span className="text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// FAQPage JSON-LD for a faq list (must mirror visible content).
export function faqJsonLdFor(faqs) {
  if (!faqs?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

const SectionLanding = ({
  section, // e.g. 'reading'
  heading,
  intro,
  title,
  description,
  items = [],
  questionTypeOptions, // Reading only: [{ value, label }] for the type filter
}) => {
  const canonical = `${SITE_URL}/${section}question`;
  const skillLabel = section
    ? section.charAt(0).toUpperCase() + section.slice(1)
    : 'Practice';
  const ogTitle = `IELTS ${skillLabel} Practice`;
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
    ogTitle
  )}&type=${encodeURIComponent(section || 'default')}`;
  const faqs = SECTION_FAQS[section] || [];
  const faqJsonLd = faqJsonLdFor(faqs);
  const readingTypeLinks = section === 'reading' ? availableReadingTypeLinks(items) : [];

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
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={`${ogTitle} — IELTS-Bank`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={`${ogTitle} — IELTS-Bank`} />
        {faqJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c'),
            }}
          />
        ) : null}
      </Head>

      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <header className="mb-8 max-w-2xl">
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {heading}
              </h1>
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
                {intro}
              </p>
            </header>

            <DataTable skill={section} items={items} questionTypeOptions={questionTypeOptions} />

            {/* Reading only: practise by question type. */}
            {readingTypeLinks.length > 0 && (
              <section className="mt-12 rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Practice by question type
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Target a specific IELTS Reading question type with a focused strategy guide and
                  matching practice passages.
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {readingTypeLinks.map(({ slug, label }) => (
                    <NextLink
                      key={slug}
                      href={`/reading/${slug}`}
                      className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      {label}
                    </NextLink>
                  ))}
                </div>
              </section>
            )}
            <FaqSection faqs={faqs} />
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default SectionLanding;
