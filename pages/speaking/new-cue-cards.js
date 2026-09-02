import React from 'react';
import NextLink from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import {
  SpeakingHubHead,
  SpeakingHubShell,
  SpeakingBreadcrumb,
  QuickAnswer,
  CueCardList,
  FamilyChips,
  updatedLabel,
} from '../../src/components/SpeakingHub';
import { getNewCueCardsData } from '../../lib/speakingHubs';
import { SPEAKING_TOPIC_FAMILIES } from '../../lib/speakingTopicFamilies';
import { SITE_URL } from '../../lib/site';

const CANONICAL = `${SITE_URL}/speaking/new-cue-cards`;

export default function NewCueCards({ months = [], total = 0, updatedAt = null }) {
  const updated = updatedLabel(updatedAt);
  const newest = months[0];

  const seo = {
    title: 'New IELTS Speaking Cue Cards, Updated Monthly | IELTS-Bank',
    description: `Newly added IELTS Speaking Part 2 cue cards, grouped by the month we published them. ${total} free cards with examiner audio and Band 8–9 model answers.`,
    canonical: CANONICAL,
    ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
      'New IELTS Speaking Cue Cards'
    )}&type=speaking&subtitle=${encodeURIComponent(updated || 'Updated monthly')}`,
    imageAlt: 'New IELTS Speaking cue cards — IELTS-Bank',
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'IELTS Speaking', item: `${SITE_URL}/speakingquestion` },
          { '@type': 'ListItem', position: 3, name: 'New cue cards', item: CANONICAL },
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': `${CANONICAL}#page`,
        name: 'New IELTS Speaking cue cards',
        url: CANONICAL,
        description: seo.description,
        // Truthful freshness: the newest cue card's own timestamp, never "now".
        ...(updatedAt ? { dateModified: new Date(updatedAt).toISOString() } : {}),
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: total,
          itemListElement: (newest?.items || []).slice(0, 50).map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.topic || item.title,
            url: `${SITE_URL}${item.href}`,
          })),
        },
      },
    ],
  };

  const answer =
    `This page lists every IELTS Speaking Part 2 cue card on IELTS-Bank by the month it was added, newest first — ` +
    `${total} card${total === 1 ? '' : 's'} in total${
      newest ? `, most recently in ${newest.label}` : ''
    }. Every card is original, free to practise, and comes with examiner audio, a one-minute prep timer and a Band 8–9 model answer.`;

  return (
    <>
      <SpeakingHubHead seo={seo} jsonLd={jsonLd} />
      <SpeakingHubShell>
        <SpeakingBreadcrumb current="New cue cards" />

        <header className="mb-8 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            Updated as new batches are published
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            New IELTS Speaking Cue Cards
          </h1>
          <QuickAnswer>{answer}</QuickAnswer>
          {updated ? <p className="mt-3 text-sm text-muted-foreground">Updated {updated}</p> : null}
        </header>

        {months.length === 0 ? (
          <CueCardList items={[]} />
        ) : (
          <div className="space-y-12">
            {months.map((month) => (
              <section key={month.key} aria-labelledby={`month-${month.key}`}>
                <h2
                  id={`month-${month.key}`}
                  className="mb-1 text-2xl font-bold tracking-tight text-foreground"
                >
                  Which cue cards were added in {month.label}?
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  {month.items.length} cue card{month.items.length === 1 ? '' : 's'} added in {month.label}.
                </p>
                <CueCardList items={month.items} />
              </section>
            ))}
          </div>
        )}

        <section className="mt-12 rounded-2xl border border-accent/30 bg-accent/5 p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            How should you practise a new cue card?
          </h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Open a card, listen to the examiner read it, take the full minute of notes, then record
            yourself speaking until you are stopped at two minutes. Compare what you said with the
            model answer afterwards rather than before.
          </p>
          <NextLink
            href="/speaking/part-2"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline"
          >
            Read the IELTS Speaking Part 2 guide
            <ArrowRight className="h-4 w-4" />
          </NextLink>
        </section>

        <section className="mt-8 rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Browse cue cards by topic</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {Object.keys(SPEAKING_TOPIC_FAMILIES).length} topic families, from people and places to
            technology and the future.
          </p>
          <FamilyChips />
        </section>
      </SpeakingHubShell>
    </>
  );
}

export async function getStaticProps() {
  let data = { months: [], total: 0, updatedAt: null };
  try {
    data = await getNewCueCardsData();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[speaking/new-cue-cards] falling back to empty list:', err?.message || err);
  }
  // Short revalidate so the freshness hub picks up each imported batch.
  return { props: data, revalidate: 3600 };
}
