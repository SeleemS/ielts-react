// src/components/SpeakingHub.jsx
// Shared building blocks for the /speaking hub pages (part hubs, topic-family
// hubs, and the new-cue-cards freshness hub). Keeps the three pages visually
// identical to the reading/listening hubs without triplicating markup.

import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, Inbox } from 'lucide-react';
import Navbar from './Navbar';
import Footer from './Footer';
import { SPEAKING_TOPIC_FAMILIES, SPEAKING_FAMILY_SLUGS } from '../../lib/speakingTopicFamilies';
import { SPEAKING_PARTS, SPEAKING_PART_SLUGS } from '../../lib/speakingParts';

const DIFFICULTY_STYLES = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  hard: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
};
const DIFFICULTY_FALLBACK =
  'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20';

export function DifficultyBadge({ difficulty }) {
  if (!difficulty) return null;
  const style = DIFFICULTY_STYLES[String(difficulty).toLowerCase()] || DIFFICULTY_FALLBACK;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style}`}
    >
      {difficulty}
    </span>
  );
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Truthful "Updated <Month YYYY>" derived from the newest item's timestamp.
export function updatedLabel(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function SpeakingHubHead({ seo, jsonLd }) {
  return (
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
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      ) : null}
    </Head>
  );
}

export function SpeakingBreadcrumb({ current }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
      <NextLink href="/" className="no-underline hover:text-accent">
        Home
      </NextLink>
      <span className="px-1.5">/</span>
      <NextLink href="/speakingquestion" className="no-underline hover:text-accent">
        Speaking
      </NextLink>
      <span className="px-1.5">/</span>
      <span className="text-foreground">{current}</span>
    </nav>
  );
}

// The above-the-fold "Quick answer" capsule, identical in look to the reading
// and listening hubs.
export function QuickAnswer({ children }) {
  if (!children) return null;
  return (
    <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Quick answer</p>
      <p className="mt-1 leading-relaxed text-foreground">{children}</p>
    </div>
  );
}

export function CueCardList({ items, emptyHint }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Inbox className="h-6 w-6" />
        </span>
        <p className="text-base font-semibold text-foreground">No cue cards here yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {emptyHint || (
            <>
              We are adding more cards. In the meantime, browse the full{' '}
              <NextLink href="/speakingquestion" className="font-semibold text-accent no-underline">
                Speaking question bank
              </NextLink>
              .
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.slug} className="list-none">
          <NextLink
            href={item.href}
            className="group flex h-full flex-col rounded-xl border border-border bg-card p-4 no-underline shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
          >
            <span className="text-sm font-semibold leading-snug text-foreground group-hover:text-accent">
              {item.topic || item.title}
            </span>
            {item.explainLine ? (
              <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.explainLine}</span>
            ) : null}
            <span className="mt-3 flex items-center justify-between gap-2">
              <DifficultyBadge difficulty={item.difficulty} />
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                Practise
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </span>
          </NextLink>
        </li>
      ))}
    </ul>
  );
}

export function FamilyChips({ activeFamily }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2.5">
      {SPEAKING_FAMILY_SLUGS.filter((slug) => slug !== activeFamily).map((slug) => (
        <NextLink
          key={slug}
          href={`/speaking/topics/${slug}`}
          className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
        >
          {SPEAKING_TOPIC_FAMILIES[slug].label}
        </NextLink>
      ))}
    </div>
  );
}

export function PartChips({ activePart }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2.5">
      {SPEAKING_PART_SLUGS.filter((slug) => slug !== activePart).map((slug) => (
        <NextLink
          key={slug}
          href={`/speaking/${slug}`}
          className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
        >
          Speaking {SPEAKING_PARTS[slug].label}
        </NextLink>
      ))}
      <NextLink
        href="/speaking/new-cue-cards"
        className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
      >
        New cue cards
      </NextLink>
      <NextLink
        href="/speakingquestion"
        className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent no-underline transition-colors hover:bg-accent/20"
      >
        All speaking practice
        <ArrowRight className="h-4 w-4" />
      </NextLink>
    </div>
  );
}

export function SpeakingHubShell({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
