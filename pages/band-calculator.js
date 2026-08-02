import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { Calculator, Info, ArrowRight, BookOpen, PenLine, Headphones, Mic } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Card, CardContent } from '../components/ui/card';
import { Select } from '../components/ui/select';
import { Label } from '../components/ui/label';
import {
  LISTENING_TABLE,
  READING_ACADEMIC_TABLE,
  READING_GENERAL_TABLE,
  listeningBand,
  readingBand,
  overallBand,
  clampRaw,
  formatBand,
} from '../lib/bandTables';
import { track } from '../src/lib/analytics';
import NewsletterSignup from '../src/components/NewsletterSignup';
import ShareRow from '../src/components/ShareRow';
import { useAuth } from '../src/lib/auth';

import { BAND_CALCULATOR_SEO } from '../lib/bandCalculatorSeo';
const PAGE_TITLE = BAND_CALCULATOR_SEO.title;
const PAGE_DESCRIPTION = BAND_CALCULATOR_SEO.description;
const CANONICAL = BAND_CALCULATOR_SEO.canonical;

// Band select options: 0.0 .. 9.0 in 0.5 steps.
const BAND_OPTIONS = Array.from({ length: 19 }, (_, i) => i * 0.5);

const FAQ = [
  {
    q: 'How is the overall IELTS band score calculated?',
    a: 'Your overall band is the average (mean) of your four skill bands — Listening, Reading, Writing and Speaking — rounded to the nearest half band. The rounding rule is specific: if the average ends in .25 it is rounded up to the next half band, and if it ends in .75 it is rounded up to the next whole band. For example, an average of 6.25 becomes 6.5 and an average of 6.75 becomes 7.0.',
  },
  {
    q: 'What raw score do I need for band 7 in IELTS Listening?',
    a: 'On these estimated conversions, roughly 30–31 correct answers out of 40 in Listening corresponds to a band 7.0, and about 32–34 correct corresponds to band 7.5. The exact raw score varies slightly from one test version to another because the official conversion is set per test, so treat these figures as a guide rather than a guarantee.',
  },
  {
    q: 'Why are Academic and General Training Reading conversions different?',
    a: 'The Reading passages differ in difficulty between Academic and General Training, so the two modules use different raw-to-band curves. General Training Reading generally requires more correct answers for the same band — for instance, around 34–35 correct for band 7.0 in General Training versus about 30–32 in Academic. Listening uses the same conversion for both modules.',
  },
  {
    q: 'How are the Writing and Speaking bands scored?',
    a: 'Writing and Speaking are not converted from a raw score. They are marked by trained examiners against four equally-weighted criteria. Writing is judged on Task Achievement/Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy. Speaking is judged on Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, and Pronunciation. Because there is no public raw-score table, you enter your Writing and Speaking bands directly in this calculator.',
  },
];

const SKILL_LINKS = [
  { href: '/readingquestion', label: 'Reading practice', icon: BookOpen },
  { href: '/writingquestion', label: 'Writing practice', icon: PenLine },
  { href: '/listeningquestion', label: 'Listening practice', icon: Headphones },
  { href: '/speakingquestion', label: 'Speaking practice', icon: Mic },
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

// A read-only conversion table rendered for crawlers and human reference.
function ConversionTable({ caption, rows }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="border-b border-border bg-muted/50 px-4 py-3 text-left text-sm font-semibold text-foreground">
            {caption}
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Raw score (out of 40)
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Band score
              </th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => r.band >= 2.5)
              .map((r) => (
                <tr key={`${r.rawMin}-${r.rawMax}`} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 tabular-nums text-foreground">
                    {r.rawMin === r.rawMax ? r.rawMin : `${r.rawMin}–${r.rawMax}`}
                  </td>
                  <td className="px-4 py-2 font-semibold tabular-nums text-foreground">
                    {formatBand(r.band)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// A live band readout tile.
function BandTile({ label, band }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{formatBand(band)}</div>
    </div>
  );
}

export default function BandCalculator() {
  const { user } = useAuth();
  const [listeningRaw, setListeningRaw] = useState('30');
  const [readingRaw, setReadingRaw] = useState('30');
  const [readingModule, setReadingModule] = useState('academic');
  const [writing, setWriting] = useState('6.5');
  const [speaking, setSpeaking] = useState('6.5');

  const lBand = useMemo(
    () => (listeningRaw === '' ? null : listeningBand(listeningRaw)),
    [listeningRaw]
  );
  const rBand = useMemo(
    () => (readingRaw === '' ? null : readingBand(readingRaw, readingModule)),
    [readingRaw, readingModule]
  );
  const wBand = writing === '' ? null : Number(writing);
  const sBand = speaking === '' ? null : Number(speaking);

  const overall = useMemo(
    () => overallBand([lBand, rBand, wBand, sBand]),
    [lBand, rBand, wBand, sBand]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      track('band_calculator_use', {
        calculator: 'band',
        listening_raw: listeningRaw === '' ? null : Number(listeningRaw),
        reading_raw: readingRaw === '' ? null : Number(readingRaw),
        reading_module: readingModule,
        writing_band: wBand,
        speaking_band: sBand,
        overall_band: overall,
        signed_in: Boolean(user?.id),
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [listeningRaw, readingRaw, readingModule, wBand, sBand, overall, user?.id]);

  const rawInputClass =
    'h-10 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background sm:text-sm';

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
        <meta property="og:image" content={BAND_CALCULATOR_SEO.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={BAND_CALCULATOR_SEO.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={BAND_CALCULATOR_SEO.ogImage} />
        <meta name="twitter:image:alt" content={BAND_CALCULATOR_SEO.imageAlt} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <header className="mb-8 max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                <Calculator className="h-3.5 w-3.5" />
                Free IELTS tool
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                IELTS Band Score Calculator
              </h1>
              {/* Answer capsule: direct answer above the fold for AI citation. */}
              <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">Quick answer</p>
                <p className="mt-1 leading-relaxed text-foreground">
                  Your overall IELTS band is the average of your four skill bands (Listening,
                  Reading, Writing, Speaking) rounded to the nearest half band — averages ending in
                  .25 round up to .5, and .75 rounds up to the next whole band. Listening and
                  Reading bands come from your raw score out of 40 via conversion tables.
                </p>
              </div>
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
                Enter your Listening and Reading raw scores and your Writing and Speaking bands to
                estimate each skill band and your overall IELTS band score, calculated with the
                official rounding rule.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Updated August 2026</p>
            </header>

            {/* ===================== CALCULATOR WIDGET ===================== */}
            <Card className="mb-6">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Listening */}
                  <div>
                    <Label htmlFor="listening-raw">Listening raw score (0–40)</Label>
                    <input
                      id="listening-raw"
                      type="number"
                      min={0}
                      max={40}
                      inputMode="numeric"
                      value={listeningRaw}
                      onChange={(e) => setListeningRaw(e.target.value)}
                      onBlur={(e) =>
                        setListeningRaw(e.target.value === '' ? '' : String(clampRaw(e.target.value)))
                      }
                      className={`mt-1.5 ${rawInputClass}`}
                    />
                  </div>

                  {/* Reading */}
                  <div>
                    <Label htmlFor="reading-raw">Reading raw score (0–40)</Label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id="reading-raw"
                        type="number"
                        min={0}
                        max={40}
                        inputMode="numeric"
                        value={readingRaw}
                        onChange={(e) => setReadingRaw(e.target.value)}
                        onBlur={(e) =>
                          setReadingRaw(e.target.value === '' ? '' : String(clampRaw(e.target.value)))
                        }
                        className={rawInputClass}
                      />
                      <Select
                        aria-label="Reading module"
                        value={readingModule}
                        onChange={(e) => setReadingModule(e.target.value)}
                        className="w-40"
                      >
                        <option value="academic">Academic</option>
                        <option value="general">General</option>
                      </Select>
                    </div>
                  </div>

                  {/* Writing */}
                  <div>
                    <Label htmlFor="writing-band">Writing band</Label>
                    <Select
                      id="writing-band"
                      value={writing}
                      onChange={(e) => setWriting(e.target.value)}
                      className="mt-1.5"
                    >
                      {BAND_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {formatBand(b)}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Speaking */}
                  <div>
                    <Label htmlFor="speaking-band">Speaking band</Label>
                    <Select
                      id="speaking-band"
                      value={speaking}
                      onChange={(e) => setSpeaking(e.target.value)}
                      className="mt-1.5"
                    >
                      {BAND_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {formatBand(b)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Live per-skill bands */}
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <BandTile label="Listening" band={lBand} />
                  <BandTile label="Reading" band={rBand} />
                  <BandTile label="Writing" band={wBand} />
                  <BandTile label="Speaking" band={sBand} />
                </div>

                {/* Overall */}
                <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-6 py-5 sm:flex-row">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-wide text-accent">
                      Estimated overall band
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Mean of the four skills, rounded with the official rule.
                    </p>
                  </div>
                  <div className="text-5xl font-extrabold tabular-nums text-foreground">
                    {formatBand(overall)}
                  </div>
                </div>
                <ShareRow
                  className="mt-4"
                  source="band_calculator"
                  path="/band-calculator"
                  text={`My IELTS overall band works out to ${formatBand(overall)} — calculate yours free at IELTS-Bank`}
                />
                <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-xl bg-slate-950 px-5 py-4 text-white sm:flex-row sm:items-center">
                  <div>
                    <p className="font-bold">That overall estimate is only as good as your Writing band.</p>
                    <p className="mt-1 text-sm text-slate-300">Get your real essay checked against all four Writing criteria.</p>
                  </div>
                  <NextLink
                    href="/ielts-writing-checker?source=band-calculator"
                    onClick={() => track('product_cta_click', { source: 'band_calculator_result', product: 'writing_checker' })}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white no-underline hover:bg-emerald-400"
                  >
                    Check my Writing <ArrowRight className="h-4 w-4" />
                  </NextLink>
                </div>
              </CardContent>
            </Card>

            {/* ===================== DISCLAIMER ===================== */}
            <div className="mb-12 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <strong>Estimates only.</strong> The Listening and Reading conversions shown here are
                well-known public approximations. The official raw-to-band conversion is set for each
                individual test version and is not published, so your actual band may differ. This
                tool is not affiliated with or endorsed by the British Council, IDP or Cambridge
                Assessment English.
              </p>
            </div>

            <div className="mb-12 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
              <h2 className="text-lg font-bold">Haven&apos;t taken a full test yet?</h2>
              <p className="mt-2 text-sm leading-6">
                Take the free 15-minute Band Estimator to answer real Reading and Listening
                questions and get a four-skill starting range.
              </p>
              <NextLink href="/band-estimator" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-emerald-800 no-underline hover:underline">
                Estimate my band <ArrowRight className="h-4 w-4" />
              </NextLink>
            </div>

            {/* ===================== CONVERSION TABLES ===================== */}
            <section className="mb-12">
              <h2 className="mb-4 text-2xl font-bold tracking-tight text-foreground">
                IELTS raw score to band score conversion tables
              </h2>
              <p className="mb-6 max-w-3xl text-muted-foreground">
                These estimated conversion tables show how many correct answers (the raw score, out
                of 40) map to each band for Listening and for Academic and General Training Reading.
              </p>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <ConversionTable caption="Listening (Academic & General Training)" rows={LISTENING_TABLE} />
                <ConversionTable caption="Academic Reading" rows={READING_ACADEMIC_TABLE} />
                <ConversionTable caption="General Training Reading" rows={READING_GENERAL_TABLE} />
              </div>
            </section>

            {/* ===================== FAQ ===================== */}
            <section className="mb-12">
              <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground">
                Frequently asked questions
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
            <NewsletterSignup source="band-calculator" className="mb-12" />
            <section className="rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Practise for a higher band
              </h2>
              <p className="mt-2 text-muted-foreground">
                Put your target band into practice with free, auto-scored questions for every skill.
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
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
