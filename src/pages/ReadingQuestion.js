import React from 'react';
import Head from 'next/head';
import Navbar from '../components/Navbar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import QuestionEngine from '../components/question/QuestionEngine';
import RelatedPractice from '../components/RelatedPractice';
import { sanitizeHtml } from '../../lib/sanitize';

import { SITE_URL } from '../../lib/site';
const PASSAGE_HTML_CLASS =
  'text-[15px] leading-7 text-foreground [&_p]:mb-4 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1';

function ShareButton({ title, text }) {
  const onShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        /* user cancelled */
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* noop */
      }
    }
  };
  return (
    <Button variant="outline" size="lg" onClick={onShare}>
      Share
    </Button>
  );
}

const ReadingQuestion = ({ id, passage, description, related = [] }) => {
  if (!passage) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-lg font-semibold text-muted-foreground">Loading question…</h1>
        </div>
      </div>
    );
  }

  const { title, bodyHtml, groups, difficulty, slug, legacyId } = passage;
  const pageTitle = title
    ? `${title} | IELTS Reading Practice | IELTS-Bank`
    : 'IELTS Reading Practice | IELTS-Bank';
  const metaDescription =
    description || `Read and answer IELTS Reading questions for the passage: ${title}.`;
  // Canonicalise to the SAME URL the sitemap emits: the legacy Firestore id when
  // one exists (already-indexed URLs), otherwise the slug. Both URLs pre-render,
  // so a single stable canonical prevents duplicate-content indexing.
  const canonicalId = legacyId || slug || id || '';
  const canonicalUrl = `${SITE_URL}/readingquestion/${encodeURIComponent(canonicalId)}`;
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
    title || 'IELTS Reading Practice'
  )}&type=reading${difficulty ? `&subtitle=${encodeURIComponent(difficulty)}` : ''}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LearningResource',
        '@id': `${canonicalUrl}#resource`,
        name: title,
        description: metaDescription,
        url: canonicalUrl,
        learningResourceType: 'IELTS Reading practice test',
        educationalUse: 'IELTS exam preparation',
        educationalLevel: difficulty || 'Intermediate to Advanced',
        inLanguage: 'en',
        isAccessibleForFree: true,
        teaches: 'IELTS Academic and General Reading skills',
        about: { '@type': 'Thing', name: 'IELTS Reading' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'IELTS Reading',
            item: `${SITE_URL}/readingquestion`,
          },
          { '@type': 'ListItem', position: 3, name: title, item: canonicalUrl },
        ],
      },
    ],
  };

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta
          name="keywords"
          content="IELTS, IELTS Reading, IELTS Academic Reading, IELTS General Reading, IELTS Reading Questions, IELTS Practice, IELTS Test Prep"
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={`IELTS Reading practice: ${title}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={`IELTS Reading practice: ${title}`} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="min-h-screen bg-background">
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                IELTS Reading Practice
                {difficulty && (
                  <Badge variant="emerald" className="capitalize">
                    {difficulty}
                  </Badge>
                )}
              </p>
            </div>
          </div>

          {/* Two-column: passage left, questions right */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
                  Reading Passage
                </h2>
              </div>
              <div className="max-h-[45vh] supports-[height:100dvh]:max-h-[45dvh] overflow-y-auto px-5 py-4 lg:max-h-[calc(100vh-13rem)]">
                <div
                  className={PASSAGE_HTML_CLASS}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
                  Questions
                </h2>
              </div>
              <div className="max-h-[70vh] supports-[height:100dvh]:max-h-[70dvh] overflow-y-auto px-5 py-4 lg:max-h-[calc(100vh-13rem)]">
                <QuestionEngine
                  groups={groups}
                  storageKey={slug || id}
                  skill="reading"
                  durationSeconds={20 * 60}
                  module={passage.module || 'academic'}
                  stickyTopClass="-top-4 -mx-5 -mt-4 rounded-none border-x-0 border-t-0 shadow-sm"
                />
              </div>
            </div>
          </div>

          <RelatedPractice skill="reading" items={related} className="mt-10" />

          <div className="mt-8 flex justify-center">
            <ShareButton title={title} text={`Check out this IELTS Reading test: ${title}`} />
          </div>
        </main>
      </div>
    </>
  );
};

export default ReadingQuestion;
