import React from 'react';
import NextLink from 'next/link';
import { Target, ListChecks, AlertTriangle, Clock, Ear, HelpCircle } from 'lucide-react';
import {
  SpeakingHubHead,
  SpeakingHubShell,
  SpeakingBreadcrumb,
  QuickAnswer,
  CueCardList,
  PartChips,
  updatedLabel,
} from '../../src/components/SpeakingHub';
import { SPEAKING_PARTS, SPEAKING_PART_SLUGS, getSpeakingPartSeo } from '../../lib/speakingParts';
import { SPEAKING_TOPIC_FAMILIES } from '../../lib/speakingTopicFamilies';
import { getSpeakingPartHubData } from '../../lib/speakingHubs';
import { SITE_URL } from '../../lib/site';

export default function SpeakingPartHub({ partSlug, cueCards = [], questionGroups = [], updatedAt = null }) {
  const config = SPEAKING_PARTS[partSlug];
  const { label, h1, guide, timingLine } = config;
  const seo = getSpeakingPartSeo(partSlug);
  const updated = updatedLabel(updatedAt);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'IELTS Speaking', item: `${SITE_URL}/speakingquestion` },
          { '@type': 'ListItem', position: 3, name: `Speaking ${label}`, item: seo.canonical },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${seo.canonical}#faq`,
        mainEntity: guide.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.q,
          acceptedAnswer: { '@type': 'Answer', text: faq.a },
        })),
      },
      ...(updatedAt
        ? [
            {
              '@type': 'CollectionPage',
              '@id': `${seo.canonical}#page`,
              name: h1,
              url: seo.canonical,
              description: seo.description,
              dateModified: new Date(updatedAt).toISOString(),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <SpeakingHubHead seo={seo} jsonLd={jsonLd} />
      <SpeakingHubShell>
        <SpeakingBreadcrumb current={label} />

        <header className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{h1}</h1>
          <QuickAnswer>{guide.answer}</QuickAnswer>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{guide.intro}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {timingLine}
            {updated ? ` · Updated ${updated}` : ''}
          </p>
        </header>

        <article className="mb-12 space-y-8">
          <section>
            <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Target className="h-5 w-5 text-accent" />
              What does IELTS Speaking {label} test?
            </h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{guide.tests}</p>
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Ear className="h-5 w-5 text-accent" />
              What is the examiner listening for in {label}?
            </h2>
            <ul className="mt-3 space-y-2">
              {guide.listeningFor.map((point, i) => (
                <li key={i} className="flex gap-3 leading-relaxed text-muted-foreground">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {point}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <ListChecks className="h-5 w-5 text-accent" />
              How should you answer {label} questions?
            </h2>
            <ol className="mt-3 space-y-3">
              {guide.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <AlertTriangle className="h-5 w-5 text-accent" />
              What mistakes lose marks in {label}?
            </h2>
            <ul className="mt-3 space-y-2">
              {guide.traps.map((trap, i) => (
                <li key={i} className="flex gap-3 leading-relaxed text-muted-foreground">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {trap}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Clock className="h-5 w-5 text-accent" />
              How long does IELTS Speaking {label} last?
            </h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{guide.timing}</p>
          </section>
        </article>

        {/* ===================== PRACTICE ===================== */}
        {config.part === 2 ? (
          <section className="mb-12">
            <h2 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
              Practise {label} cue cards
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {cueCards.length} free cue cards with examiner audio, a one-minute prep timer and an
              original Band 8–9 model answer.{' '}
              <NextLink href="/speaking/new-cue-cards" className="font-semibold text-accent no-underline">
                See the newest cards
              </NextLink>
              .
            </p>
            <CueCardList items={cueCards} />
          </section>
        ) : (
          <section className="mb-12">
            <h2 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
              Practise {label} questions by topic
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Every question below links to the practice item it belongs to, where the examiner reads
              it aloud and you can record your answer.
            </p>
            {questionGroups.length === 0 ? (
              <p className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
                Questions are being published — browse the{' '}
                <NextLink href="/speakingquestion" className="font-semibold text-accent no-underline">
                  full speaking bank
                </NextLink>
                .
              </p>
            ) : (
              <div className="space-y-8">
                {questionGroups.map((group) => (
                  <div key={group.family}>
                    <h3 className="text-base font-bold text-foreground">
                      {SPEAKING_TOPIC_FAMILIES[group.family]?.label || group.family}
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {group.sets.slice(0, 8).map((set) => (
                        <li key={set.slug} className="rounded-lg border border-border bg-card p-3">
                          <NextLink
                            href={set.href}
                            className="text-sm font-semibold text-foreground no-underline hover:text-accent"
                          >
                            {set.topic || set.title}
                          </NextLink>
                          <ul className="mt-1.5 space-y-1">
                            {set.questions.map((question, i) => (
                              <li key={i} className="text-sm leading-relaxed text-muted-foreground">
                                {question}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                    <NextLink
                      href={`/speaking/topics/${group.family}`}
                      className="mt-2 inline-block text-sm font-semibold text-accent no-underline"
                    >
                      All {SPEAKING_TOPIC_FAMILIES[group.family]?.label || group.family} topics →
                    </NextLink>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ===================== FAQ ===================== */}
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <HelpCircle className="h-5 w-5 text-accent" />
            IELTS Speaking {label}: common questions
          </h2>
          <div className="space-y-5">
            {guide.faqs.map((faq) => (
              <div key={faq.q}>
                <h3 className="text-base font-bold text-foreground">{faq.q}</h3>
                <p className="mt-1 leading-relaxed text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===================== CROSS-LINKS ===================== */}
        <section className="rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Practise the other parts</h2>
          <PartChips activePart={partSlug} />
        </section>
      </SpeakingHubShell>
    </>
  );
}

export async function getStaticPaths() {
  return {
    paths: SPEAKING_PART_SLUGS.map((part) => ({ params: { part } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const partSlug = params.part;
  const config = SPEAKING_PARTS[partSlug];
  if (!config) return { notFound: true };

  let data = { cueCards: [], questionGroups: [], updatedAt: null };
  try {
    data = await getSpeakingPartHubData(config.part);
  } catch (err) {
    // Fail-soft: the guide prose is the SEO payload and must render regardless.
    // eslint-disable-next-line no-console
    console.warn(`[speaking/${partSlug}] falling back to empty lists:`, err?.message || err);
  }

  return { props: { partSlug, ...data }, revalidate: 3600 };
}
