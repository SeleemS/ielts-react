import Head from 'next/head';
import NextLink from 'next/link';
import { Mic, ArrowRight, MessageSquare, ListChecks, ClipboardList, Sparkles } from 'lucide-react';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { cn } from '../../src/lib/utils';
import { listSpeakingItems } from '../../lib/supabase';
import { SECTION_FAQS, FaqSection, faqJsonLdFor } from '../../src/components/SectionLanding';
import { SPEAKING_PART_LINKS } from '../../lib/speakingParts';
import { SPEAKING_FAMILY_LINKS } from '../../lib/speakingTopicFamilies';

import { SITE_URL } from '../../lib/site';
const PAGE_TITLE = 'IELTS Speaking Practice with AI Feedback | IELTS-Bank';
const PAGE_DESCRIPTION =
  'Practise IELTS Speaking Part 1, Part 2 cue cards and Part 3 discussion questions with an examiner voice. Record your answers and get instant AI band feedback on Fluency, Lexical Resource and Grammar.';
const CANONICAL = `${SITE_URL}/speakingquestion`;
const OG_IMAGE = `${SITE_URL}/api/og?title=${encodeURIComponent(
  'IELTS Speaking Practice'
)}&type=speaking`;

// Part metadata: heading copy + icon + accent for each grouped section.
const PART_META = {
  1: {
    label: 'Part 1',
    title: 'Part 1 — Introduction & interview',
    blurb: 'Short questions about familiar topics: home, work, studies and daily life.',
    icon: MessageSquare,
  },
  2: {
    label: 'Part 2',
    title: 'Part 2 — Cue cards (long turn)',
    blurb: 'Speak for up to two minutes on a topic card after one minute of preparation.',
    icon: ClipboardList,
  },
  3: {
    label: 'Part 3',
    title: 'Part 3 — Two-way discussion',
    blurb: 'Abstract, opinion-based follow-up questions linked to the Part 2 theme.',
    icon: ListChecks,
  },
};

const DIFFICULTY_STYLES = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  hard: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
};

function DifficultyBadge({ difficulty }) {
  if (!difficulty) return null;
  const style =
    DIFFICULTY_STYLES[String(difficulty).toLowerCase()] ||
    'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20';
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        style
      )}
    >
      {difficulty}
    </span>
  );
}

function ItemCard({ item, featured }) {
  const href = `/speakingquestion/${item.legacyId || item.slug}`;
  return (
    <NextLink href={href} className="no-underline">
      <Card
        className={cn(
          'group h-full transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md',
          featured && 'border-accent/30 bg-accent/5'
        )}
      >
        <CardContent className="flex h-full flex-col p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Badge variant="secondary">{PART_META[item.part]?.label || 'Speaking'}</Badge>
            <DifficultyBadge difficulty={item.difficulty} />
          </div>
          <h3 className="text-base font-bold leading-snug text-foreground group-hover:text-primary">
            {item.topic || item.title}
          </h3>
          {item.topic && item.title !== item.topic && (
            <p className="mt-1 text-sm text-muted-foreground">{item.title}</p>
          )}
          {item.topicTags?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.topicTags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            Practise
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </NextLink>
  );
}

function PartSection({ part, items }) {
  if (!items.length) return null;
  const meta = PART_META[part];
  const Icon = meta.icon;
  const featured = part === 2;
  return (
    <section className="mb-12" aria-labelledby={`part-${part}-heading`}>
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2
            id={`part-${part}-heading`}
            className="text-xl font-bold tracking-tight text-foreground"
          >
            {meta.title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{meta.blurb}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <ItemCard key={item.slug} item={item} featured={featured} />
        ))}
      </div>
    </section>
  );
}

export default function SpeakingIndex({ items = [] }) {
  const byPart = { 1: [], 2: [], 3: [] };
  items.forEach((it) => {
    if (byPart[it.part]) byPart[it.part].push(it);
  });
  const hasAny = items.length > 0;

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
        <meta property="og:image:alt" content="IELTS Speaking Practice — IELTS-Bank" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta name="twitter:image:alt" content="IELTS Speaking Practice — IELTS-Bank" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqJsonLdFor(SECTION_FAQS.speaking)).replace(/</g, '\\u003c'),
          }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <header className="mb-10 max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                <Mic className="h-3.5 w-3.5" />
                New — AI Speaking feedback
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                IELTS Speaking Practice
              </h1>
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
                Hear the examiner ask each question, record your spoken answer, and get
                instant AI band feedback on Fluency &amp; Coherence, Lexical Resource and
                Grammar. Choose a Part 1 topic, a Part 2 cue card or a Part 3 discussion set
                to begin.
              </p>
            </header>

            {/* Hubs: part guides, topic families and the freshness page. These are
                the SSR/SSG landers AI crawlers and search engines index. */}
            <nav aria-label="Speaking guides" className="mb-10 rounded-2xl border border-border bg-secondary/40 p-5 sm:p-6">
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Guides and cue cards by topic
              </h2>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {SPEAKING_PART_LINKS.map((part) => (
                  <NextLink
                    key={part.slug}
                    href={`/speaking/${part.slug}`}
                    className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    Speaking {part.label} guide
                  </NextLink>
                ))}
                <NextLink
                  href="/speaking/new-cue-cards"
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent no-underline transition-colors hover:bg-accent/20"
                >
                  New cue cards
                  <ArrowRight className="h-4 w-4" />
                </NextLink>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {SPEAKING_FAMILY_LINKS.map((family) => (
                  <NextLink
                    key={family.slug}
                    href={`/speaking/topics/${family.slug}`}
                    className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground no-underline transition-colors hover:text-accent"
                  >
                    {family.label}
                  </NextLink>
                ))}
              </div>
            </nav>

            <NextLink
              href="/speaking-examiner"
              className="mb-10 flex flex-col justify-between gap-3 rounded-xl border-2 border-primary/60 bg-card p-5 no-underline shadow-sm transition hover:shadow-md sm:flex-row sm:items-center"
            >
              <div>
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  New: live AI examiner mock interviews
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Have a real-time voice conversation with an AI examiner — full 3-part mock or
                  single-part drills — and get your band score at the end. Premium.
                </p>
              </div>
              <span className="shrink-0 rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
                Try the examiner
              </span>
            </NextLink>

            {hasAny ? (
              <>
                <PartSection part={2} items={byPart[2]} />
                <PartSection part={1} items={byPart[1]} />
                <PartSection part={3} items={byPart[3]} />
              </>
            ) : (
              <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
                <p className="text-base font-semibold text-foreground">
                  No speaking questions available yet
                </p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  Speaking practice items are being published. Please check back soon.
                </p>
              </div>
            )}
            <FaqSection faqs={SECTION_FAQS.speaking} />
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}

export async function getStaticProps() {
  let items = [];
  try {
    items = await listSpeakingItems();
  } catch (err) {
    // Fail-soft: render the landing even if Supabase is briefly unreachable.
    console.error('Speaking index: failed to list items', err);
  }
  return { props: { items }, revalidate: 3600 };
}
