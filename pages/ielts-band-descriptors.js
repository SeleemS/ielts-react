import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, PenLine, Mic, CalendarCheck, ClipboardList, Calculator } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';

import { SITE_URL } from '../lib/site';

const PAGE_TITLE = 'IELTS Band Descriptors Explained: Writing & Speaking Criteria (Bands 5–9)';
const PAGE_DESCRIPTION =
  'What IELTS examiners look for at each band: the four Writing criteria and four Speaking criteria summarised in plain English for bands 5–9, with tables.';
const CANONICAL = `${SITE_URL}/ielts-band-descriptors`;
const OG_IMAGE = `${SITE_URL}/api/og?title=${encodeURIComponent(
  'IELTS Band Descriptors Explained'
)}&type=guide&subtitle=${encodeURIComponent('Writing & Speaking criteria, bands 5–9')}`;
const IMAGE_ALT = 'IELTS band descriptors — Writing and Speaking criteria explained';

// The visible on-page Q&As. The FAQPage JSON-LD is generated from this SAME
// array so the structured data never drifts from the rendered content.
const FAQ = [
  {
    q: 'What are the IELTS band descriptors?',
    a: 'The band descriptors are the marking criteria IELTS examiners use to score Writing and Speaking. Each skill is assessed on four criteria, each scored from band 0 to 9, and your band for that skill is the average of the four criterion scores.',
  },
  {
    q: 'What are the four IELTS Writing criteria?',
    a: 'Task Response (Task Achievement for Task 1), Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy. Each is worth 25% of the task score, and Task 2 counts twice as much as Task 1 in your final Writing band.',
  },
  {
    q: 'What are the four IELTS Speaking criteria?',
    a: 'Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, and Pronunciation. Each contributes equally (25%) to your Speaking band.',
  },
  {
    q: 'What is the difference between band 6 and band 7 in Writing?',
    a: 'Band 7 answers stay clearly focused on the question with a position maintained throughout, use paragraphs each built around one central idea, deploy some less common vocabulary with mostly accurate word choice, and produce frequent error-free sentences. Band 6 answers cover the task but develop some parts thinly, link ideas somewhat mechanically, and make more frequent vocabulary and grammar errors — though meaning still comes through.',
  },
  {
    q: 'Are the band descriptors the same for Academic and General Training?',
    a: 'Yes for Speaking and for Writing Task 2. Writing Task 1 uses the same four criteria in both modules, but the first criterion (Task Achievement) is judged against different task types: a data/process description in Academic and a letter in General Training.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

// ---------------------------------------------------------------------------
// Band 5–9 criterion summaries, paraphrased in our own words from the public
// descriptors (we deliberately do NOT reproduce the official text).
// ---------------------------------------------------------------------------

const WRITING_TABLE = {
  caption: 'IELTS Writing band descriptors summarised (Task 2 criteria, bands 5–9)',
  head: ['Band', 'Task Response', 'Coherence & Cohesion', 'Lexical Resource', 'Grammatical Range & Accuracy'],
  rows: [
    [
      '9',
      'Every part of the question is fully explored; the position is completely developed with well-chosen, extended ideas.',
      'Ideas flow so naturally that the linking never draws attention to itself; paragraphing is skilful throughout.',
      'A very wide vocabulary used precisely and naturally; at most the rare minor slip.',
      'Structures of every kind used flexibly and accurately; errors are no more than rare slips.',
    ],
    [
      '8',
      'All parts of the task are dealt with well; a clear position supported by relevant, extended ideas, with only occasional thin patches.',
      'Information and ideas are sequenced logically, transitions are managed well, and paragraphs are used appropriately.',
      'A wide range of vocabulary conveys precise meanings fluently, including skilful use of less common words, with only occasional inaccuracy.',
      'A wide range of structures; the large majority of sentences are error-free, with only very occasional mistakes.',
    ],
    [
      '7',
      'The whole question is addressed with a clear position maintained throughout; ideas are extended and supported, though focus can slip or generalise in places.',
      'Clear progression from start to finish; linking words are used well (occasionally over- or under-used) and each paragraph has one clear central topic.',
      'Enough range to write with some flexibility and precision; less common vocabulary appears with some sense of style and collocation, alongside occasional wrong choices.',
      'A variety of complex structures with good control; many sentences are error-free and remaining mistakes are minor.',
    ],
    [
      '6',
      'All parts of the task are covered, though unevenly; the position is relevant but conclusions may blur or repeat; ideas are relevant but not fully developed.',
      'Organisation is coherent with an overall progression; connectors are present but sometimes mechanical, faulty, or repetitive in their referencing.',
      'Vocabulary is adequate for the task; attempts at less common words bring some inaccuracy, and spelling or word-form errors appear without blocking the message.',
      'A mix of simple and complex sentence forms; errors in grammar and punctuation occur but rarely obscure meaning.',
    ],
    [
      '5',
      'The task is tackled only partially; the position is not always clear, the format may be partly inappropriate, and ideas are limited or padded with irrelevant detail.',
      'Some organisation is visible but the essay lacks steady progression; linkers are missing, wrong or overused, and weak referencing causes repetition.',
      'A limited vocabulary that is only just sufficient; noticeable errors in spelling and word formation that can make reading difficult.',
      'A narrow range of structures; complex sentences are attempted but frequently faulty, and errors can cause real difficulty for the reader.',
    ],
  ],
};

const SPEAKING_TABLE = {
  caption: 'IELTS Speaking band descriptors summarised (bands 5–9)',
  head: ['Band', 'Fluency & Coherence', 'Lexical Resource', 'Grammatical Range & Accuracy', 'Pronunciation'],
  rows: [
    [
      '9',
      'Speaks fluently, pausing only to think about ideas rather than language; topics are developed fully and coherently.',
      'Complete flexibility and precision; idiomatic language is used naturally and accurately across any topic.',
      'The full range of structures used naturally and appropriately; consistently accurate apart from the kind of slips any fluent speaker makes.',
      'The full range of pronunciation features — stress, rhythm, intonation — used with precision; effortless to understand throughout.',
    ],
    [
      '8',
      'Fluent, with only occasional repetition or self-correction; hesitation is usually about content, not finding words; topics develop coherently and appropriately.',
      'A wide resource conveys precise meaning readily; less common and idiomatic language is used skilfully, with effective paraphrase when needed.',
      'A wide range of structures used flexibly; most sentences are error-free, with only very occasional inaccuracies.',
      'A wide range of features sustained with only occasional lapses; easy to understand throughout, and any accent has minimal effect.',
    ],
    [
      '7',
      'Speaks at length without noticeable effort or loss of coherence; some language-related hesitation, repetition or self-correction; connectives and discourse markers used with some flexibility.',
      'Vocabulary is flexible enough to discuss a variety of topics; some less common and idiomatic items with an awareness of style, plus effective paraphrase.',
      'A range of complex structures used with some flexibility; error-free sentences are frequent even though some grammatical mistakes persist.',
      'Generally easy to understand throughout; a range of features such as sentence stress and intonation is used effectively, though control lapses at times.',
    ],
    [
      '6',
      'Willing and able to keep going at length, though repetition, self-correction or hesitation sometimes costs coherence; a range of connectives, not always used accurately.',
      'Enough vocabulary to discuss topics at length; meaning stays clear despite some inappropriate word choices, and paraphrase generally succeeds.',
      'A mix of simple and complex forms, but with limited flexibility; complex structures often contain errors, though these rarely obscure meaning.',
      'A range of pronunciation features with mixed control; occasional mispronunciations occur but clarity is only rarely reduced.',
    ],
    [
      '5',
      'Usually maintains the flow of speech, but leans on repetition, self-correction and slower delivery to do so; certain connectives are overused; speaks freely only on familiar topics.',
      'Can talk about familiar and unfamiliar topics, but with limited flexibility in word choice; paraphrase is attempted with mixed success.',
      'Basic sentence forms are produced with reasonable accuracy; complex structures are limited in range and usually contain errors.',
      'Understandable overall, but uneven stress, intonation or individual sounds sometimes make the listener work; some features are handled well, others inconsistently.',
    ],
  ],
};

// A static, crawler-friendly data table in the site's standard card style.
function DataTable({ table }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="border-b border-border bg-muted/50 px-4 py-3 text-left text-sm font-semibold text-foreground">
            {table.caption}
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {table.head.map((h) => (
                <th
                  key={h}
                  className="min-w-[10rem] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:min-w-0"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row[0]} className="border-b border-border last:border-b-0 align-top">
                {row.map((cell, i) => (
                  <td
                    key={i}
                    className={`px-4 py-2.5 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Question-phrased H2 followed by a 1–2 sentence direct answer, then detail.
function QASection({ question, answer, children }) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">{question}</h2>
      <p className="mt-3 max-w-3xl font-medium leading-relaxed text-foreground">{answer}</p>
      {children}
    </section>
  );
}

export default function IeltsBandDescriptors() {
  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={IMAGE_ALT} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta name="twitter:image:alt" content={IMAGE_ALT} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <header className="mb-8 max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                <ClipboardList className="h-3.5 w-3.5" />
                IELTS guide
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                IELTS Band Descriptors Explained: What Examiners Look For at Each Band
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarCheck className="h-4 w-4" />
                Updated 2 August 2026
              </p>

              {/* Answer capsule — the core answer, first. */}
              <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-5">
                <p className="leading-relaxed text-foreground">
                  <strong>
                    IELTS Writing and Speaking are each marked on four criteria, every criterion
                    scored from 0 to 9.
                  </strong>{' '}
                  Writing: Task Response, Coherence &amp; Cohesion, Lexical Resource, and
                  Grammatical Range &amp; Accuracy. Speaking: Fluency &amp; Coherence, Lexical
                  Resource, Grammatical Range &amp; Accuracy, and Pronunciation. Your skill band is
                  the average of the four — so knowing what each criterion demands at your target
                  band is the fastest way to raise your score.
                </p>
              </div>
            </header>

            {/* ===================== HOW MARKING WORKS ===================== */}
            <QASection
              question="How do the IELTS band descriptors work?"
              answer="Examiners do not give a single impression mark. They score each of the four criteria separately against published descriptors, and your band for the skill is the average of the four criterion scores."
            >
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                This has a practical consequence: an essay with impressive vocabulary can still
                score 6.0 overall if it drifts off the question (Task Response) or reads as a wall
                of loosely connected sentences (Coherence &amp; Cohesion). Equally, a candidate who
                speaks accurately but in short, hesitant bursts is capped by Fluency &amp;
                Coherence. The tables below paraphrase, in plain English, what the public
                descriptors ask for at bands 5 through 9 — the range where almost all university
                and visa requirements sit. For the examiners&#39; exact wording, consult the official
                descriptor documents published by the IELTS partners.
              </p>
            </QASection>

            {/* ===================== WRITING TABLE ===================== */}
            <QASection
              question="What are the IELTS Writing band descriptors?"
              answer="Writing is scored on Task Response, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy — each worth a quarter of the mark. Task 2 counts twice as much as Task 1."
            >
              <div className="mt-5">
                <DataTable table={WRITING_TABLE} />
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                The table summarises the Task 2 criteria; Task 1 replaces Task Response with Task
                Achievement, which judges how well you report the chart, process or map (Academic)
                or fulfil the letter&#39;s purpose (General Training) — the other three criteria are
                the same. To see exactly where your own essays sit against these criteria, run one
                through the free{' '}
                <NextLink href="/ielts-writing-checker" className="font-semibold text-accent no-underline hover:underline">
                  IELTS writing checker
                </NextLink>
                , which scores all four criteria and explains what is holding each one down.
              </p>
            </QASection>

            {/* ===================== SPEAKING TABLE ===================== */}
            <QASection
              question="What are the IELTS Speaking band descriptors?"
              answer="Speaking is scored on Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, and Pronunciation, each contributing 25% of your Speaking band."
            >
              <div className="mt-5">
                <DataTable table={SPEAKING_TABLE} />
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Notice how much weight the criteria place on keeping going: hesitating to hunt for
                a &quot;better&quot; word usually costs more under Fluency &amp; Coherence than the
                simpler word would ever cost under Lexical Resource. Build the habit with the free{' '}
                <NextLink href="/speakingquestion" className="font-semibold text-accent no-underline hover:underline">
                  Speaking practice bank
                </NextLink>{' '}
                — real Part 1, 2 and 3 questions you can answer against the clock.
              </p>
            </QASection>

            {/* ===================== USING THEM ===================== */}
            <QASection
              question="How should you use the band descriptors to raise your score?"
              answer="Diagnose your weakest criterion first — your band rises fastest by fixing the lowest of the four scores, not by polishing what is already strong."
            >
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                Read the row for your target band and the row below it, and identify which
                criterion&#39;s description of the lower band still sounds like your work: that is the
                one capping your average. Writing candidates most often lose to Task Response
                (drifting from the exact question) and Coherence &amp; Cohesion (paragraphs without
                one clear idea); Speaking candidates most often lose to Fluency &amp; Coherence.
                Half-bands come from averaging — for example criterion scores of 7, 7, 6 and 6
                produce 6.5 — so a single criterion moving up one band lifts your skill score by
                half a band.
              </p>
            </QASection>

            {/* ===================== FAQ ===================== */}
            <section className="mb-12">
              <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground">
                IELTS band descriptors FAQ
              </h2>
              <div className="space-y-4">
                {FAQ.map((item) => (
                  <div key={item.q} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-foreground">{item.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ===================== INTERNAL LINKS ===================== */}
            <section className="rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Put the descriptors to work
              </h2>
              <p className="mt-2 text-muted-foreground">
                Get scored against these exact criteria, then practise the skills that are holding
                your band down.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <NextLink
                  href="/ielts-writing-checker"
                  className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <span className="flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-accent" />
                    Score my writing
                  </span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </NextLink>
                <NextLink
                  href="/speakingquestion"
                  className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <span className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-accent" />
                    Speaking practice
                  </span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </NextLink>
                <NextLink
                  href="/band-calculator"
                  className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <span className="flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-accent" />
                    Band calculator
                  </span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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
