import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, Calculator, Gauge, CalendarCheck, ClipboardList } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';

import { SITE_URL } from '../lib/site';

const PAGE_TITLE = 'IELTS Score Requirements by Country: UK, Canada, Australia & Canada PR (CLB)';
const PAGE_DESCRIPTION =
  'Typical IELTS scores needed for UK, Canadian and Australian universities (6.0–7.0), the full IELTS-to-CLB conversion table for Canada PR, and UKVI thresholds in plain terms.';
const CANONICAL = `${SITE_URL}/ielts-score-requirements`;
const OG_IMAGE = `${SITE_URL}/api/og?title=${encodeURIComponent(
  'IELTS Score Requirements'
)}&type=guide&subtitle=${encodeURIComponent('UK, Canada, Australia & CLB conversion')}`;
const IMAGE_ALT = 'IELTS score requirements by destination — universities, Canada PR and UKVI';

// The visible on-page Q&As. The FAQPage JSON-LD is generated from this SAME
// array so the structured data never drifts from the rendered content.
const FAQ = [
  {
    q: 'What IELTS score do I need for university in the UK, Canada or Australia?',
    a: 'Most universities in the UK, Canada and Australia ask for an overall band between 6.0 and 7.0, usually with a per-skill minimum of 5.5 or 6.0. Competitive programmes — law, medicine, journalism, education — commonly require 7.0 or 7.5. Always confirm the exact figure on the university’s own admissions page, as requirements vary by institution and course.',
  },
  {
    q: 'What CLB level is IELTS 6.0?',
    a: 'Under IRCC’s equivalency for IELTS General Training, scoring 6.0 in all four skills corresponds to CLB 7 — a common benchmark for Canadian Express Entry programmes. Individual skills convert separately, so your CLB profile can differ per skill.',
  },
  {
    q: 'What IELTS score is CLB 9?',
    a: 'CLB 9 requires IELTS General Training scores of Listening 8.0, Reading 7.0, Writing 7.0 and Speaking 7.0. CLB 9 or higher in all skills earns the top language points ranges in Canada’s Comprehensive Ranking System.',
  },
  {
    q: 'Does Canada PR accept IELTS Academic?',
    a: 'No — for permanent residence programmes IRCC requires the General Training module (or an accepted alternative test). IELTS Academic is used for study permits and university admission instead. Check canada.ca for the current list of accepted tests.',
  },
  {
    q: 'What IELTS score do UK visas require?',
    a: 'It depends on the route. Work routes typically require CEFR B1, which UKVI maps to IELTS 4.0 in each skill on an IELTS for UKVI test; student visas for degree-level study typically require B2-level English, which universities usually set at 5.5–6.0 per skill or higher. The gov.uk website lists the current requirement for each visa type.',
  },
  {
    q: 'Are these requirements fixed?',
    a: 'No. Universities and governments update their thresholds, and every institution can set its own. Treat the figures on this page as typical ranges for planning, and verify exact current numbers on official sources — gov.uk for UK visas, canada.ca for Canadian immigration, and each university’s admissions pages.',
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
// Table data. Kept as plain arrays so the markup below stays uniform.
// University figures are TYPICAL ranges (institutions set their own); the CLB
// table reflects IRCC's published IELTS General Training equivalency.
// ---------------------------------------------------------------------------

const UNIVERSITY_TABLE = {
  caption: 'Typical university IELTS requirements (always confirm with the institution)',
  head: ['Destination', 'Typical overall band', 'Typical per-skill minimum', 'Notes'],
  rows: [
    [
      'UK universities',
      '6.0–7.0',
      '5.5–6.5',
      'Foundation courses from ~5.5; Russell Group and competitive courses often 6.5–7.0+',
    ],
    [
      'Canadian universities',
      '6.5 (commonly)',
      '6.0',
      'Many undergraduate programmes ask 6.5 overall / 6.0 per skill; graduate programmes often higher',
    ],
    [
      'Australian universities',
      '6.0–7.0',
      '5.5–6.5',
      'Vocational courses from ~5.5–6.0; degrees usually 6.5; teaching, health and law often 7.0+',
    ],
    [
      'Competitive programmes (all three)',
      '7.0–7.5',
      '6.5–7.0',
      'Medicine, law, education, journalism and nursing routinely set the highest thresholds',
    ],
  ],
};

// IRCC's published equivalency between IELTS General Training scores and
// Canadian Language Benchmarks, per skill (public IRCC data).
const CLB_TABLE = {
  caption: 'IELTS (General Training) to CLB conversion — IRCC equivalency, per skill',
  head: ['CLB level', 'Listening', 'Reading', 'Writing', 'Speaking'],
  rows: [
    ['CLB 10', '8.5', '8.0', '7.5', '7.5'],
    ['CLB 9', '8.0', '7.0', '7.0', '7.0'],
    ['CLB 8', '7.5', '6.5', '6.5', '6.5'],
    ['CLB 7', '6.0', '6.0', '6.0', '6.0'],
    ['CLB 6', '5.5', '5.0', '5.5', '5.5'],
    ['CLB 5', '5.0', '4.0', '5.0', '5.0'],
    ['CLB 4', '4.5', '3.5', '4.0', '4.0'],
  ],
};

const UKVI_TABLE = {
  caption: 'UK visa English thresholds in general terms (check gov.uk for your route)',
  head: ['Route (general terms)', 'CEFR level', 'Typical IELTS equivalent'],
  rows: [
    ['Skilled work routes', 'B1', '4.0 in each skill (IELTS for UKVI)'],
    ['Student visa — below degree level', 'B1', '4.0 in each skill (IELTS for UKVI)'],
    ['Student visa — degree level and above', 'B2', '5.5 in each skill, though universities usually require more'],
    ['Partner / parent routes (initial application)', 'A1–A2', 'Speaking & listening only (Life Skills test)'],
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

export default function IeltsScoreRequirements() {
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
                IELTS Score Requirements: Universities, Canada PR and UK Visas
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarCheck className="h-4 w-4" />
                Updated 2 August 2026
              </p>

              {/* Answer capsule — the core answer, first. */}
              <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-5">
                <p className="leading-relaxed text-foreground">
                  <strong>
                    Most UK, Canadian and Australian universities typically ask for an overall band
                    of 6.0–7.0
                  </strong>{' '}
                  with per-skill minimums of 5.5–6.5. Canadian permanent residence uses CLB levels
                  instead — CLB 7 equals IELTS General Training 6.0 in every skill — and UK visa
                  routes set thresholds by CEFR level, from 4.0 per skill for work routes upward.
                  There is no universal pass mark: every institution and government sets its own,
                  so always verify current figures on official sources.
                </p>
              </div>
            </header>

            {/* ===================== UNIVERSITIES ===================== */}
            <QASection
              question="What IELTS score do universities typically require?"
              answer="A typical undergraduate offer in the UK, Canada or Australia asks for 6.0–6.5 overall with no skill below 5.5–6.0; competitive and professional programmes typically want 7.0 or more."
            >
              <div className="mt-5">
                <DataTable table={UNIVERSITY_TABLE} />
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                These are typical ranges, not guarantees — each university publishes its own
                requirement per course, and figures change year to year, so check the admissions
                page of every programme you apply to. Universities generally require the Academic
                module. If you are unsure how far you are from a 6.5 or 7.0 today, the free{' '}
                <NextLink href="/band-estimator" className="font-semibold text-accent no-underline hover:underline">
                  band estimator
                </NextLink>{' '}
                gives you a four-skill starting range in about 15 minutes.
              </p>
            </QASection>

            {/* ===================== CANADA PR / CLB ===================== */}
            <QASection
              question="How do IELTS scores convert to CLB levels for Canada PR?"
              answer="IRCC converts each IELTS General Training skill score to a Canadian Language Benchmark separately. CLB 7 — the common Express Entry benchmark — equals 6.0 in all four skills; CLB 9, which unlocks the top language points, requires 8.0 Listening and 7.0 in the other three."
            >
              <div className="mt-5">
                <DataTable table={CLB_TABLE} />
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Two details catch people out. First, PR programmes require the General Training
                module, not Academic. Second, conversion is per skill: Listening 7.5, Reading 6.5,
                Writing 6.5, Speaking 6.5 is CLB 8 across the board, but dropping to 6.0 in a
                single skill pulls that skill to CLB 7 and can cost significant Comprehensive
                Ranking System points. Minimum eligibility differs by programme (for example CLB 7
                for Federal Skilled Worker; CLB 5–7 for Canadian Experience Class depending on the
                job’s classification) — canada.ca has the current rules. Use the{' '}
                <NextLink href="/band-calculator" className="font-semibold text-accent no-underline hover:underline">
                  band calculator
                </NextLink>{' '}
                to see how raw Listening and Reading scores translate into the bands you need.
              </p>
            </QASection>

            {/* ===================== UKVI ===================== */}
            <QASection
              question="What are the UKVI English requirements in general terms?"
              answer="UK visas define English requirements by CEFR level rather than a single IELTS number: broadly B1 (IELTS 4.0 per skill) for work routes, and B2 (5.5 per skill) for degree-level study — though universities almost always ask for more than the visa minimum."
            >
              <div className="mt-5">
                <DataTable table={UKVI_TABLE} />
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                For visa purposes the test usually has to be an IELTS for UKVI sitting — the same
                exam, administered under additional security — and some routes accept alternatives
                or exempt nationals of majority-English-speaking countries. Routes, levels and
                accepted tests change, so treat this table as orientation and confirm your specific
                route on gov.uk before booking a test.
              </p>
            </QASection>

            {/* ===================== STRATEGY ===================== */}
            <QASection
              question="How should you plan for a target score?"
              answer="Work backwards from the per-skill minimum, not the overall band — a strong overall average with one weak skill fails most requirements."
            >
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                Almost every university and immigration requirement includes a per-skill floor, so
                your weakest skill defines the work. Establish your current level per skill, target
                the gap, and remember the overall band is the rounded mean of the four — lifting
                one skill by a whole band raises the overall by up to half a band. Half-band
                rounding also matters at thresholds: 6.25 rounds up to 6.5, so a marginal skill
                improvement can clear a requirement outright.
              </p>
            </QASection>

            {/* ===================== FAQ ===================== */}
            <section className="mb-12">
              <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground">
                IELTS score requirements FAQ
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
                Find out where you stand
              </h2>
              <p className="mt-2 text-muted-foreground">
                Measure your current level, then convert raw scores into the bands your destination
                asks for.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NextLink
                  href="/band-estimator"
                  className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <span className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-accent" />
                    Estimate my band in 15 minutes
                  </span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </NextLink>
                <NextLink
                  href="/band-calculator"
                  className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <span className="flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-accent" />
                    IELTS band score calculator
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
