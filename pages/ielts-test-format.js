import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, BookOpen, PenLine, Headphones, Mic, CalendarCheck, ClipboardList } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';

import { SITE_URL } from '../lib/site';

const PAGE_TITLE = 'IELTS Test Format 2026: Sections, Timing and Question Counts';
const PAGE_DESCRIPTION =
  'The IELTS test format in 2026: four sections, about 2h 45m in total, 40 Listening and 40 Reading questions, band scale 1–9, computer vs paper differences.';
const CANONICAL = `${SITE_URL}/ielts-test-format`;
const OG_IMAGE = `${SITE_URL}/api/og?title=${encodeURIComponent(
  'IELTS Test Format 2026'
)}&type=guide&subtitle=${encodeURIComponent('Sections, timing & question counts')}`;
const IMAGE_ALT = 'IELTS test format 2026 — sections, timing and question counts';

// The visible on-page Q&As. The FAQPage JSON-LD is generated from this SAME
// array so the structured data never drifts from the rendered content.
const FAQ = [
  {
    q: 'How long is the IELTS test?',
    a: 'The whole IELTS test takes about 2 hours 45 minutes. Listening, Reading and Writing are taken together in one sitting of roughly 2 hours 30–45 minutes, and the 11–14 minute Speaking test is scheduled the same day or up to a week before or after.',
  },
  {
    q: 'How many sections does IELTS have?',
    a: 'IELTS has four sections: Listening (4 parts, 40 questions, about 30 minutes), Reading (3 sections, 40 questions, 60 minutes), Writing (2 tasks, 60 minutes) and Speaking (3 parts, 11–14 minutes with a live examiner).',
  },
  {
    q: 'What is the difference between IELTS Academic and General Training?',
    a: 'Academic and General Training share identical Listening and Speaking tests. They differ in Reading — Academic uses three long academic passages while General Training uses everyday and workplace texts — and in Writing Task 1, where Academic asks you to describe a chart, graph, process or map and General Training asks for a letter. Writing Task 2 is an essay in both.',
  },
  {
    q: 'Is computer-delivered IELTS different from paper-based IELTS?',
    a: 'The content, question types, timing and scoring are the same. The practical differences: on computer you type instead of handwrite, Listening ends with a 2-minute check instead of the 10-minute paper transfer time, and results usually arrive faster (typically 1–5 days on computer versus about 13 days on paper).',
  },
  {
    q: 'What do IELTS band scores mean?',
    a: 'IELTS reports a band from 1 (non-user) to 9 (expert user) for each skill and overall, in half-band steps. Band 6 is a "competent user", band 7 a "good user" and band 8 a "very good user". There is no pass or fail — each university, employer or visa authority sets its own required band.',
  },
  {
    q: 'How is the overall IELTS band score calculated?',
    a: 'The overall band is the mean of your four skill bands, rounded to the nearest half band: an average ending in .25 rounds up to the next half band and one ending in .75 rounds up to the next whole band.',
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

const SKILL_LINKS = [
  { href: '/listeningquestion', label: 'Listening practice', icon: Headphones },
  { href: '/readingquestion', label: 'Reading practice', icon: BookOpen },
  { href: '/writingquestion', label: 'Writing practice', icon: PenLine },
  { href: '/speakingquestion', label: 'Speaking practice', icon: Mic },
];

// ---------------------------------------------------------------------------
// Table data. Kept as plain arrays so the markup below stays uniform.
// ---------------------------------------------------------------------------

const SKILLS_TABLE = {
  caption: 'The four IELTS sections at a glance (2026)',
  head: ['Section', 'Duration', 'Parts', 'Questions / tasks', 'Notes'],
  rows: [
    [
      'Listening',
      '~30 min (+ transfer/check)',
      '4 parts',
      '40 questions',
      'Audio plays once; 10 min to transfer answers on paper, 2 min to check on computer',
    ],
    ['Reading', '60 min', '3 sections', '40 questions', 'No extra transfer time'],
    [
      'Writing',
      '60 min',
      '2 tasks',
      'Task 1 (150+ words), Task 2 (250+ words)',
      'Task 2 carries twice the weight of Task 1',
    ],
    ['Speaking', '11–14 min', '3 parts', 'Interview, 2-min talk, discussion', 'Face-to-face with a certified examiner'],
  ],
};

const MODULE_TABLE = {
  caption: 'IELTS Academic vs General Training',
  head: ['Section', 'Academic', 'General Training'],
  rows: [
    ['Listening', 'Identical — 4 parts, 40 questions', 'Identical — 4 parts, 40 questions'],
    [
      'Reading',
      '3 long passages from journals, books and newspapers',
      'Everyday, workplace and general-interest texts across 3 sections',
    ],
    [
      'Writing Task 1',
      'Describe a chart, graph, table, process, map or diagram (150+ words)',
      'Write a letter — formal, semi-formal or informal (150+ words)',
    ],
    ['Writing Task 2', 'Discursive essay (250+ words)', 'Discursive essay (250+ words)'],
    ['Speaking', 'Identical — 3 parts, 11–14 minutes', 'Identical — 3 parts, 11–14 minutes'],
  ],
};

const DELIVERY_TABLE = {
  caption: 'Computer-delivered vs paper-based IELTS',
  head: ['Feature', 'Computer-delivered', 'Paper-based'],
  rows: [
    ['Content, timing & scoring', 'Identical', 'Identical'],
    ['Writing', 'Typed (live word count)', 'Handwritten'],
    ['Listening answer time', '2 minutes to check answers', '10 minutes to transfer answers'],
    ['Results', 'Typically 1–5 days', 'Typically about 13 days'],
    ['Test dates', 'Multiple sessions most days', 'Fixed dates (a few per month)'],
    ['Speaking', 'Face-to-face with an examiner', 'Face-to-face with an examiner'],
  ],
};

const BAND_TABLE = {
  caption: 'The IELTS band scale (1–9)',
  head: ['Band', 'Skill level', 'What it means'],
  rows: [
    ['9', 'Expert user', 'Fully operational command; accurate, fluent, complete understanding'],
    ['8', 'Very good user', 'Fully operational command with only occasional unsystematic inaccuracies'],
    ['7', 'Good user', 'Operational command with occasional inaccuracies in some situations'],
    ['6', 'Competent user', 'Generally effective command despite some inaccuracies and misunderstandings'],
    ['5', 'Modest user', 'Partial command; copes with overall meaning, makes many mistakes'],
    ['4', 'Limited user', 'Basic competence limited to familiar situations'],
    ['3', 'Extremely limited user', 'Conveys and understands only general meaning in very familiar situations'],
    ['2', 'Intermittent user', 'Great difficulty understanding spoken and written English'],
    ['1', 'Non-user', 'No ability to use the language beyond a few isolated words'],
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
                  className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
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

export default function IeltsTestFormat() {
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
                IELTS Test Format 2026: Sections, Timing and Question Counts
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarCheck className="h-4 w-4" />
                Updated 2 August 2026
              </p>

              {/* Answer capsule — the core answer, first. */}
              <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-5">
                <p className="leading-relaxed text-foreground">
                  <strong>The IELTS test takes about 2 hours 45 minutes and has four sections:</strong>{' '}
                  Listening (4 parts, 40 questions, ~30 minutes), Reading (3 sections, 40 questions,
                  60 minutes), Writing (2 tasks, 60 minutes) and Speaking (3 parts, 11–14 minutes).
                  Each skill — and the overall result — is scored on a band scale from 1 to 9.
                </p>
              </div>
            </header>

            {/* ===================== FOUR SKILLS ===================== */}
            <QASection
              question="What are the four sections of the IELTS test?"
              answer="IELTS tests Listening, Reading, Writing and Speaking. The first three are taken together in one sitting; Speaking is a separate face-to-face interview held the same day or up to a week before or after."
            >
              <div className="mt-5">
                <DataTable table={SKILLS_TABLE} />
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Listening and Reading are marked out of 40 and converted to a band — try the free{' '}
                <NextLink href="/band-calculator" className="font-semibold text-accent no-underline hover:underline">
                  band score calculator
                </NextLink>{' '}
                to see the conversion. Writing and Speaking are marked by examiners against four
                criteria each. You can drill every section in our free{' '}
                <NextLink href="/listeningquestion" className="font-semibold text-accent no-underline hover:underline">
                  Listening
                </NextLink>
                ,{' '}
                <NextLink href="/readingquestion" className="font-semibold text-accent no-underline hover:underline">
                  Reading
                </NextLink>
                ,{' '}
                <NextLink href="/writingquestion" className="font-semibold text-accent no-underline hover:underline">
                  Writing
                </NextLink>{' '}
                and{' '}
                <NextLink href="/speakingquestion" className="font-semibold text-accent no-underline hover:underline">
                  Speaking
                </NextLink>{' '}
                banks.
              </p>
            </QASection>

            {/* ===================== HOW LONG ===================== */}
            <QASection
              question="How long is the IELTS test?"
              answer="About 2 hours 45 minutes in total. Listening, Reading and Writing run back-to-back with no breaks; the 11–14 minute Speaking test is scheduled separately."
            >
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                On paper, Listening adds 10 minutes at the end to transfer answers to the answer
                sheet, so the sitting runs slightly longer than on computer, where you get 2 minutes
                to check answers instead. If you want to feel the full length before test day, take
                a timed{' '}
                <NextLink href="/mock-test" className="font-semibold text-accent no-underline hover:underline">
                  free IELTS mock test
                </NextLink>
                .
              </p>
            </QASection>

            {/* ===================== ACADEMIC VS GENERAL ===================== */}
            <QASection
              question="What is the difference between IELTS Academic and General Training?"
              answer="Listening and Speaking are identical in both modules. They differ only in Reading texts and in Writing Task 1: Academic asks you to describe a visual (chart, process, map), while General Training asks for a letter."
            >
              <div className="mt-5">
                <DataTable table={MODULE_TABLE} />
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Academic is typically required for university admission and professional
                registration; General Training is used for work experience and migration to
                English-speaking countries. Check which module your institution or visa route
                requires before booking.
              </p>
            </QASection>

            {/* ===================== COMPUTER VS PAPER ===================== */}
            <QASection
              question="Should I take IELTS on computer or on paper?"
              answer="The questions, timing and scoring are identical — choose based on how you write. Computer-delivered IELTS gives faster results (typically 1–5 days) and typed Writing; paper suits candidates who annotate heavily by hand."
            >
              <div className="mt-5">
                <DataTable table={DELIVERY_TABLE} />
              </div>
            </QASection>

            {/* ===================== BAND SCALE ===================== */}
            <QASection
              question="What do IELTS band scores 1–9 mean?"
              answer="Each band describes a level of English ability, from band 1 (non-user) to band 9 (expert user). Half bands (6.5, 7.5…) are awarded too, and there is no pass or fail — institutions set their own requirements."
            >
              <div className="mt-5">
                <DataTable table={BAND_TABLE} />
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Not sure where you currently stand? The free 15-minute{' '}
                <NextLink href="/band-estimator" className="font-semibold text-accent no-underline hover:underline">
                  band estimator
                </NextLink>{' '}
                gives you a four-skill starting range from real questions.
              </p>
            </QASection>

            {/* ===================== OVERALL BAND ===================== */}
            <QASection
              question="How is the overall band score calculated?"
              answer="The overall band is the mean of the four skill bands, rounded to the nearest half band. An average ending in .25 rounds up to the next half band; one ending in .75 rounds up to the next whole band."
            >
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                For example, 6.5 + 6.5 + 6.0 + 7.0 averages 6.5 overall, while an average of 6.75
                becomes 7.0. Work through your own combination with the{' '}
                <NextLink href="/band-calculator" className="font-semibold text-accent no-underline hover:underline">
                  IELTS band score calculator
                </NextLink>
                .
              </p>
            </QASection>

            {/* ===================== FAQ ===================== */}
            <section className="mb-12">
              <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground">
                IELTS test format FAQ
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
                Practise the real format for free
              </h2>
              <p className="mt-2 text-muted-foreground">
                Every question bank below mirrors the official section structure, question counts
                and timing described above.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {SKILL_LINKS.map(({ href, label, icon: Icon }) => (
                  <NextLink
                    key={href}
                    href={href}
                    className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-accent" />
                      {label}
                    </span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </NextLink>
                ))}
              </div>
              <p className="mt-5 text-sm text-muted-foreground">
                Ready for the full experience? Sit a complete timed{' '}
                <NextLink href="/mock-test" className="font-semibold text-accent no-underline hover:underline">
                  IELTS mock test
                </NextLink>{' '}
                with all four sections.
              </p>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
