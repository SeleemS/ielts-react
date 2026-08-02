import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, CalendarCheck, Info, Scale } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';

import { SITE_URL } from '../lib/site';

const PAGE_TITLE = 'IELTS vs TOEFL vs PTE vs Duolingo: 2026 Comparison';
const PAGE_DESCRIPTION =
  'IELTS, TOEFL iBT, PTE Academic and Duolingo English Test compared for 2026: format, duration, price ranges, score scales, results speed and acceptance.';
const CANONICAL = `${SITE_URL}/ielts-vs-toefl-pte-duolingo`;
const OG_IMAGE = `${SITE_URL}/api/og?title=${encodeURIComponent(
  'IELTS vs TOEFL vs PTE vs Duolingo'
)}&type=guide&subtitle=${encodeURIComponent('2026 English test comparison')}`;
const IMAGE_ALT = 'IELTS vs TOEFL vs PTE vs Duolingo English Test — 2026 comparison';

// Visible on-page Q&As; the FAQPage JSON-LD is generated from this SAME array.
const FAQ = [
  {
    q: 'Which English test should I take: IELTS, TOEFL, PTE or Duolingo?',
    a: 'Start from what your target institution or visa authority accepts — that decision outranks price and convenience. If several tests are accepted, compare budget (Duolingo is the cheapest at US$70, the others typically cost US$180–310 depending on country), how fast you need results (Duolingo and PTE typically within 48 hours, TOEFL about 3 days, IELTS 1–13 days depending on delivery mode), and whether you prefer speaking to a human examiner (IELTS) or to a computer (the other three).',
  },
  {
    q: 'Is IELTS easier than TOEFL, PTE or Duolingo?',
    a: 'No test is officially "easier" — they measure the same skills and their scores are statistically linked through published concordance tables. Individual candidates do find formats suit them differently: IELTS uses a live examiner for Speaking, TOEFL and PTE are fully computer-based at test centres, and Duolingo is a short adaptive test taken at home.',
  },
  {
    q: 'What TOEFL, PTE and Duolingo scores equal IELTS band 7?',
    a: 'Using the published concordances, IELTS band 7.0 corresponds to roughly 94–101 on the old TOEFL 0–120 scale, about 63–70 in PTE Academic (Pearson 2025 concordance), and about 130–135 on the Duolingo English Test. From January 2026 TOEFL reports a 1–6 band scale, where band 7.0 IELTS sits around TOEFL 4.5–5.',
  },
  {
    q: 'Which English test gives results fastest?',
    a: 'The Duolingo English Test and PTE Academic typically return results within 48 hours. The redesigned TOEFL iBT reports scores in about 3 days. Computer-delivered IELTS typically takes 1–5 days, and paper-based IELTS about 13 days.',
  },
  {
    q: 'Which English test is the cheapest in 2026?',
    a: 'The Duolingo English Test, at US$70 worldwide (US$118 for a two-test bundle). IELTS, TOEFL iBT and PTE Academic are priced per country and typically cost between roughly US$180 and US$310.',
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
// Comparison data (verified August 2026 — prices vary by country; see the
// disclaimer rendered under each table).
// ---------------------------------------------------------------------------

const MASTER_TABLE = {
  caption: 'IELTS vs TOEFL iBT vs PTE Academic vs Duolingo English Test (2026)',
  head: ['', 'IELTS', 'TOEFL iBT', 'PTE Academic', 'Duolingo English Test'],
  rows: [
    [
      'Format',
      'Paper or computer at a test centre; Speaking with a live examiner',
      'Computer at a test centre or at home; adaptive Reading/Listening (from Jan 2026)',
      'Computer at a test centre; fully AI-scored',
      'Online at home, adaptive, remotely proctored',
    ],
    [
      'Duration',
      '~2 h 45 min total',
      '~90 min',
      '~2 h in one sitting',
      '~1 h (plus setup)',
    ],
    [
      'Typical price',
      '~US$215–310 (varies by country)',
      '~US$180–300 (varies by country)',
      '~US$180–250 (varies by country; US$235 in the US)',
      'US$70 worldwide (US$118 for 2 tests)',
    ],
    [
      'Score scale',
      'Bands 1–9 (half bands)',
      'Bands 1–6 from Jan 2026 (0–120 shown alongside until 2028)',
      '10–90',
      '10–160',
    ],
    [
      'Results',
      '1–5 days (computer), ~13 days (paper)',
      '~3 days',
      'Typically within 48 hours',
      'Within 48 hours',
    ],
    [
      'Accepted by',
      '12,500+ organisations; widely used for study, work and migration',
      '13,000+ institutions in 160+ countries',
      '4,000+ institutions; accepted for Australia/NZ and UK visas',
      '6,000+ institutions; mainly university admissions, limited visa use',
    ],
  ],
};

const EQUIVALENCE_TABLE = {
  caption: 'Score equivalence: IELTS ↔ TOEFL ↔ PTE ↔ Duolingo (published concordances)',
  head: ['IELTS band', 'TOEFL iBT (0–120)', 'PTE Academic', 'Duolingo English Test'],
  rows: [
    ['9.0', '118–120', '90', '160'],
    ['8.5', '115–117', '86–89', '160'],
    ['8.0', '110–114', '79–85', '150–155'],
    ['7.5', '102–109', '71–78', '140–145'],
    ['7.0', '94–101', '63–70', '130–135'],
    ['6.5', '79–93', '55–62', '120–125'],
    ['6.0', '60–78', '47–54', '105–115'],
    ['5.5', '46–59', '39–46', '95–100'],
    ['5.0', '35–45', '31–38', '80–90'],
  ],
};

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
              {table.head.map((h, i) => (
                <th
                  key={i}
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

function QASection({ question, answer, children }) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">{question}</h2>
      <p className="mt-3 max-w-3xl font-medium leading-relaxed text-foreground">{answer}</p>
      {children}
    </section>
  );
}

export default function IeltsVsToeflPteDuolingo() {
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
                <Scale className="h-3.5 w-3.5" />
                English test comparison
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                IELTS vs TOEFL vs PTE vs Duolingo English Test (2026 Comparison)
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarCheck className="h-4 w-4" />
                Updated 2 August 2026
              </p>

              {/* Answer capsule — the core answer, first. */}
              <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-5">
                <p className="leading-relaxed text-foreground">
                  <strong>
                    The right test depends on three things: what your target institution or visa
                    authority accepts, your budget, and how fast you need results.
                  </strong>{' '}
                  All four tests measure the same skills and are linked by published score
                  concordances. Always confirm acceptance with your institution before booking —
                  that one check outranks every other difference on this page.
                </p>
              </div>
            </header>

            {/* ===================== MASTER TABLE ===================== */}
            <section className="mb-6">
              <DataTable table={MASTER_TABLE} />
            </section>
            <div className="mb-12 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Prices are set per country by each test provider and change over time — the ranges
                above are indicative for 2026. Always check the official IELTS, ETS (TOEFL), Pearson
                (PTE) and Duolingo websites for the exact fee in your country. This page is an
                independent comparison; we are not affiliated with any of these test providers.
              </p>
            </div>

            {/* ===================== EQUIVALENCE ===================== */}
            <QASection
              question="How do IELTS, TOEFL, PTE and Duolingo scores compare?"
              answer="The table below aligns the four scales using the providers' published concordances: the ETS TOEFL–IELTS linking study, Pearson's 2025 PTE–IELTS concordance, and Duolingo's official IELTS comparison chart."
            >
              <div className="mt-5">
                <DataTable table={EQUIVALENCE_TABLE} />
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Concordances are statistical estimates, not guarantees — institutions set their own
                cut scores and may use slightly different mappings. Note that from 21 January 2026
                the TOEFL iBT reports a 1–6 band scale; the familiar 0–120 score (shown above)
                appears alongside it on score reports until 2028. On the new scale, IELTS 6.0 sits
                around TOEFL band 3.5–4 and IELTS 7.0 around band 4.5–5, per the ETS comparison
                tables.
              </p>
            </QASection>

            {/* ===================== PER-TEST SECTIONS ===================== */}
            <QASection
              question="What is the IELTS test like?"
              answer="IELTS is a four-section test (Listening, Reading, Writing, Speaking) taking about 2 hours 45 minutes, scored on bands 1–9, with Speaking conducted face-to-face by a trained examiner."
            >
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                It is accepted by more than 12,500 organisations and is the most widely recognised
                option for migration routes (for example Australia, Canada, New Zealand and the UK)
                as well as university study. You can take it on paper or computer; results arrive in
                about 1–5 days on computer or around 13 days on paper, and fees are set locally —
                roughly US$215–310 depending on the country. See the full{' '}
                <NextLink href="/ielts-test-format" className="font-semibold text-accent no-underline hover:underline">
                  IELTS test format guide
                </NextLink>{' '}
                for section-by-section detail.
              </p>
            </QASection>

            <QASection
              question="What is the TOEFL iBT like in 2026?"
              answer="The redesigned TOEFL iBT (launched 21 January 2026) is about 90 minutes long, uses adaptive Reading and Listening sections, and reports a new 1–6 band scale with results in about 3 days."
            >
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                TOEFL is accepted by more than 13,000 institutions in over 160 countries and is
                particularly established for admission to universities in the United States. All
                four skills are tested by computer at a test centre or via the home edition, with
                Speaking recorded rather than examiner-led. During the 2026–2028 transition, score
                reports show the new band, the equivalent 0–120 score and a CEFR level side by
                side.
              </p>
            </QASection>

            <QASection
              question="What is PTE Academic like?"
              answer="PTE Academic is a computer-based test of about 2 hours in a single sitting, scored 10–90 by automated scoring, with results typically available within 48 hours."
            >
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                It is accepted by more than 4,000 institutions and is approved for student and
                migration visa routes in Australia and New Zealand as well as UK visa applications.
                Speaking is done into a microphone at the test centre and scored by AI. Fees are set
                per country — commonly in the US$180–250 range (US$235 in the United States).
              </p>
            </QASection>

            <QASection
              question="What is the Duolingo English Test like?"
              answer="The Duolingo English Test is a roughly one-hour adaptive test taken online at home, priced at US$70 worldwide, scored 10–160, with certified results within 48 hours."
            >
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                It is accepted by more than 6,000 institutions, mostly for university admissions —
                it is generally not accepted for skilled-migration visa routes, so check carefully
                if you need a test for immigration purposes. The at-home format uses strict remote
                proctoring, and one fee covers sending results to unlimited institutions.
              </p>
            </QASection>

            {/* ===================== FAQ ===================== */}
            <section className="mb-12">
              <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground">
                IELTS vs TOEFL vs PTE vs Duolingo FAQ
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
                Preparing for IELTS? Start with our free tools
              </h2>
              <p className="mt-2 text-muted-foreground">
                If IELTS is your test, everything below is free and mirrors the real format.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NextLink
                  href="/band-estimator"
                  className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                >
                  15-minute band estimator
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </NextLink>
                <NextLink
                  href="/band-calculator"
                  className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                >
                  Band score calculator
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </NextLink>
                <NextLink
                  href="/ielts-writing-checker"
                  className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                >
                  AI Writing checker
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </NextLink>
                <NextLink
                  href="/mock-test"
                  className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                >
                  Full mock tests
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
