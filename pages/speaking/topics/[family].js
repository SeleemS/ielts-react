import React from 'react';
import NextLink from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  SpeakingHubHead,
  SpeakingHubShell,
  SpeakingBreadcrumb,
  QuickAnswer,
  CueCardList,
  FamilyChips,
  updatedLabel,
} from '../../../src/components/SpeakingHub';
import {
  SPEAKING_TOPIC_FAMILIES,
  SPEAKING_FAMILY_SLUGS,
  getSpeakingFamilySeo,
} from '../../../lib/speakingTopicFamilies';
import { getSpeakingFamilyHubData } from '../../../lib/speakingHubs';
import { SITE_URL } from '../../../lib/site';

export default function SpeakingFamilyHub({ family, cueCards = [], related = [], updatedAt = null }) {
  const config = SPEAKING_TOPIC_FAMILIES[family];
  const seo = getSpeakingFamilySeo(family);
  const updated = updatedLabel(updatedAt);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'IELTS Speaking', item: `${SITE_URL}/speakingquestion` },
          { '@type': 'ListItem', position: 3, name: 'Speaking Part 2', item: `${SITE_URL}/speaking/part-2` },
          { '@type': 'ListItem', position: 4, name: config.label, item: seo.canonical },
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': `${seo.canonical}#page`,
        name: config.h1,
        url: seo.canonical,
        description: seo.description,
        ...(updatedAt ? { dateModified: new Date(updatedAt).toISOString() } : {}),
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: cueCards.length,
          itemListElement: cueCards.slice(0, 50).map((item, index) => ({
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
    `${config.label} cue cards ask you to speak for one to two minutes about ${config.label.toLowerCase()}. ` +
    `We have ${cueCards.length} free ${config.label.toLowerCase()} cue card${cueCards.length === 1 ? '' : 's'}, ` +
    `each with examiner audio, a one-minute preparation timer and an original Band 8–9 model answer. ${config.blurb}`;

  return (
    <>
      <SpeakingHubHead seo={seo} jsonLd={jsonLd} />
      <SpeakingHubShell>
        <SpeakingBreadcrumb current={config.label} />

        <header className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{config.h1}</h1>
          <QuickAnswer>{answer}</QuickAnswer>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{config.description}</p>
          {updated ? <p className="mt-2 text-sm text-muted-foreground">Updated {updated}</p> : null}
        </header>

        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold tracking-tight text-foreground">
            Which {config.label.toLowerCase()} cue cards can you practise?
          </h2>
          <CueCardList items={cueCards} />
        </section>

        {related.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-2xl font-bold tracking-tight text-foreground">
              Part 1 and Part 3 practice on this topic
            </h2>
            <ul className="space-y-2">
              {related.map((item) => (
                <li key={item.slug}>
                  <NextLink
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 no-underline transition-colors hover:border-accent/40"
                  >
                    <span className="text-sm font-semibold text-foreground">{item.topic || item.title}</span>
                    <span className="shrink-0 text-xs font-semibold text-accent">Part {item.part}</span>
                  </NextLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-10 rounded-2xl border border-accent/30 bg-accent/5 p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            How do you structure a Part 2 answer?
          </h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            One minute to make notes, then one to two minutes of uninterrupted speech: name your choice,
            work through the bullet points, and save the last 30–45 seconds for the &ldquo;and
            explain&rdquo; line.
          </p>
          <NextLink
            href="/speaking/part-2"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline"
          >
            Full IELTS Speaking Part 2 guide
            <ArrowRight className="h-4 w-4" />
          </NextLink>
        </section>

        <section className="rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Other speaking topics</h2>
          <FamilyChips activeFamily={family} />
        </section>
      </SpeakingHubShell>
    </>
  );
}

export async function getStaticPaths() {
  return {
    paths: SPEAKING_FAMILY_SLUGS.map((family) => ({ params: { family } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const family = params.family;
  if (!SPEAKING_TOPIC_FAMILIES[family]) return { notFound: true };

  let data = { cueCards: [], related: [], updatedAt: null };
  try {
    data = await getSpeakingFamilyHubData(family);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[speaking/topics/${family}] falling back to empty list:`, err?.message || err);
  }

  return { props: { family, ...data }, revalidate: 3600 };
}
