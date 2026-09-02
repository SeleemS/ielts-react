import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowLeft, ArrowRight, Calculator, CalendarCheck, ClipboardList, Gauge } from 'lucide-react';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import {
  SCORE_REQUIREMENT_COUNTRIES,
  SCORE_REQUIREMENT_COUNTRY_SLUGS,
  getScoreRequirementCountry,
} from '../../lib/scoreRequirementsData';
import { countryScoreRequirementsSeo, SCORE_REQUIREMENTS_PATH } from '../../lib/scoreRequirementsSeo';

// Every figure on these pages is attributed. A row without a source would be an
// unsourced claim about a third party's requirements, which is exactly what we
// must not publish — lib/scoreRequirementsData.test.js enforces it.
function Sources({ sources }) {
  return (
    <ul className="m-0 list-none space-y-1 p-0">
      {sources.map((source) => (
        <li key={source.url}>
          <a
            href={source.url}
            rel="nofollow noopener"
            className="text-xs font-medium text-accent underline underline-offset-2 hover:text-accent/80"
          >
            {source.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function SourcedTable({ caption, head, rows }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="border-b border-border bg-muted/50 px-4 py-3 text-left text-sm font-semibold text-foreground">
            {caption}
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {head.map((h) => (
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
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border align-top last:border-b-0">
                <td className="px-4 py-2.5 font-semibold text-foreground">{row.key}</td>
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-4 py-2.5 text-muted-foreground">
                    {cell}
                  </td>
                ))}
                <td className="px-4 py-2.5">
                  <Sources sources={row.sources} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CountryScoreRequirements({ country, seo, otherCountries }) {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: country.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <NextLink
              href={SCORE_REQUIREMENTS_PATH}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:text-accent/80"
            >
              <ArrowLeft className="h-4 w-4" />
              All score requirements
            </NextLink>

            <header className="mb-8 mt-6 max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                <ClipboardList className="h-3.5 w-3.5" />
                IELTS guide
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                IELTS Score Requirements for {country.name}
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarCheck className="h-4 w-4" />
                Sources checked {country.verifiedOn}
              </p>

              <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  Quick answer
                </p>
                <p className="mt-2 leading-relaxed text-foreground">{country.answer}</p>
              </div>
            </header>

            <section className="mb-12">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                What IELTS score do you need for {country.shortName}?
              </h2>
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                The band you need depends entirely on why you are taking the test. Each row below
                links to the authority that publishes the figure, because requirements change and
                the source page is always more current than any summary of it.
              </p>
              <div className="mt-5">
                <SourcedTable
                  caption={`Typical IELTS requirements for ${country.name} by purpose`}
                  head={['Purpose', 'Typical requirement', 'Notes', 'Source']}
                  rows={country.purposes.map((row) => ({
                    key: row.purpose,
                    cells: [row.band, row.notes],
                    sources: row.sources,
                  }))}
                />
              </div>
            </section>

            {country.universities.length ? (
              <section className="mb-12">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  What do {country.shortName} universities ask for?
                </h2>
                <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                  These are the minimums each university published on its own admissions pages when
                  we checked on {country.verifiedOn}. They are institution-wide floors: individual
                  courses frequently ask for more, so confirm the figure on the page for your exact
                  programme before you book a test.
                </p>
                <div className="mt-5">
                  <SourcedTable
                    caption={`Published IELTS minimums at selected ${country.shortName} universities (checked ${country.verifiedOn})`}
                    head={['University', 'Undergraduate', 'Postgraduate', 'Notes', 'Source']}
                    rows={country.universities.map((row) => ({
                      key: row.name,
                      cells: [row.undergrad, row.postgrad, row.notes],
                      sources: row.sources,
                    }))}
                  />
                </div>
              </section>
            ) : null}

            <section className="mb-12">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                How should you plan for a target score?
              </h2>
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                Work backwards from the per-skill minimum rather than the overall band. Almost every
                requirement above includes a floor for each of the four skills, so a strong average
                with one weak skill still fails. Establish where you are per skill, then target the
                gap — and remember that the overall band is the rounded mean of the four, so 6.25
                rounds up to 6.5 and a single half-band improvement can clear a threshold outright.
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
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                To see what the examiners are actually looking for at your target band, read the{' '}
                <NextLink
                  href="/ielts-band-descriptors"
                  className="font-semibold text-accent no-underline hover:underline"
                >
                  IELTS band descriptors
                </NextLink>
                .
              </p>
            </section>

            <section className="mb-12">
              <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground">
                IELTS requirements for {country.shortName}: FAQ
              </h2>
              <div className="space-y-4">
                {country.faq.map((item) => (
                  <div key={item.q} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-foreground">{item.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Other destinations</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {otherCountries.map((other) => (
                  <NextLink
                    key={other.slug}
                    href={`${SCORE_REQUIREMENTS_PATH}/${other.slug}`}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground no-underline shadow-sm hover:border-accent/40 hover:text-accent"
                  >
                    {other.shortName}
                  </NextLink>
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                For the Canada PR CLB conversion table and UK visa levels side by side, see the{' '}
                <NextLink
                  href={SCORE_REQUIREMENTS_PATH}
                  className="font-semibold text-accent no-underline hover:underline"
                >
                  main IELTS score requirements guide
                </NextLink>
                .
              </p>
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
    paths: SCORE_REQUIREMENT_COUNTRY_SLUGS.map((country) => ({ params: { country } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const country = getScoreRequirementCountry(params.country);
  if (!country) return { notFound: true };

  return {
    props: {
      country,
      seo: countryScoreRequirementsSeo(country),
      otherCountries: SCORE_REQUIREMENT_COUNTRIES.filter((c) => c.slug !== country.slug).map(
        (c) => ({ slug: c.slug, shortName: c.shortName })
      ),
    },
  };
}
