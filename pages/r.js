import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Button } from '../components/ui/button';
import { BandHero } from '../src/components/question/ScoreUI';
import { SITE_URL } from '../lib/site';

// Share landing for band results: /r?band=7.0&skill=reading.
// A link shared to WhatsApp/Telegram unfurls as the branded band card (OG
// image below) and lands the friend here with a clear "beat this score" path
// into free practice. Query params carry only a band + skill — no user data,
// nothing to look up, so the page needs no database. noindex: these are
// parameterized share URLs, not content pages.

const SKILL_META = {
  reading: { label: 'Reading', href: '/readingquestion', cta: 'Try a free Reading passage' },
  listening: { label: 'Listening', href: '/listeningquestion', cta: 'Try a free Listening part' },
  writing: { label: 'Writing', href: '/ielts-writing-checker', cta: 'Score my Writing free' },
  speaking: { label: 'Speaking', href: '/speakingquestion', cta: 'Try a Speaking question' },
  mock: { label: 'Timed mock test', href: '/mock-test', cta: 'Sit the same mock' },
  overall: { label: 'Overall estimate', href: '/band-estimator', cta: 'Get my estimate free' },
};

function parseBand(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return null;
  const snapped = Math.round(parsed * 2) / 2;
  if (snapped < 1 || snapped > 9) return null;
  return snapped;
}

export default function ShareLanding({ band, skill }) {
  const meta = SKILL_META[skill];
  const bandLabel = band.toFixed(1);
  const title = `Band ${bandLabel} on IELTS-Bank — can you beat it?`;
  const description = `A learner scored Band ${bandLabel} on ${meta.label.toLowerCase()} practice at IELTS-Bank. Try the same free practice with instant marking and AI feedback.`;
  const ogImage = `${SITE_URL}/api/og?band=${bandLabel}&skill=${skill}`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="noindex, follow" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImage} />
      </Head>
      <Navbar />
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-accent">
          Shared result · {meta.label}
        </p>
        <div className="mt-6">
          <BandHero band={band} subtitle={meta.label} />
        </div>
        <h1 className="mt-8 text-3xl font-bold tracking-tight text-foreground">
          Think you can beat Band {bandLabel}?
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          This score came from free IELTS practice with instant marking. Try the same
          {skill === 'mock' ? ' timed mock' : ' questions'} yourself — no account needed to start.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="accent" size="lg">
            <NextLink href={meta.href} className="no-underline">
              {meta.cta} <ArrowRight className="h-4 w-4" />
            </NextLink>
          </Button>
          <Button asChild variant="outline" size="lg">
            <NextLink href="/band-estimator" className="no-underline">
              Estimate my band in 15 min
            </NextLink>
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Bands on IELTS-Bank are practice estimates marked against the public IELTS band
          descriptors — not official results.
        </p>
      </main>
      <Footer />
    </>
  );
}

export function getServerSideProps({ query }) {
  const band = parseBand(query.band);
  const skill = typeof query.skill === 'string' && SKILL_META[query.skill] ? query.skill : null;
  // A malformed share link falls through to the estimator rather than 404ing
  // the friend who clicked it.
  if (band === null || !skill) {
    return { redirect: { destination: '/band-estimator', permanent: false } };
  }
  return { props: { band, skill } };
}
