import React from 'react';
import Head from 'next/head';
import { Headphones } from 'lucide-react';
import Navbar from '../components/Navbar';
import { Badge } from '../../components/ui/badge';
import QuestionEngine from '../components/question/QuestionEngine';
import AudioPlayer from '../components/question/AudioPlayer';
import ListeningIntroModal from '../components/question/ListeningIntroModal';
import RelatedPractice from '../components/RelatedPractice';
import { sanitizeHtml } from '../../lib/sanitize';
import { track } from '../lib/analytics';
import { useAuth } from '../lib/auth';
import { getLocalPref, setLocalPref, loadUserPref, saveUserPref } from '../lib/prefs';

import { SITE_URL } from '../../lib/site';

// Pref name for "don't show the listening intro modal again". Stored locally
// for logged-out users and in users.prefs for signed-in users (src/lib/prefs).
const INTRO_PREF = 'listeningIntroDismissed';

const ListeningQuestion = ({ id, passage, description, related = [] }) => {
  const [audioDuration, setAudioDuration] = React.useState(null);
  const [introOpen, setIntroOpen] = React.useState(false);
  const { user, loading: authLoading } = useAuth();

  // Decide whether to show the intro modal once auth has resolved. The local
  // pref is checked first so repeat visitors (and signed-in users we've cached
  // for) never see a flash; the Supabase pref covers a signed-in user's other
  // devices.
  React.useEffect(() => {
    if (!passage || authLoading) return undefined;
    if (getLocalPref(INTRO_PREF)) return undefined;
    let active = true;
    if (user?.id) {
      loadUserPref(user.id, INTRO_PREF).then((dismissed) => {
        if (!active) return;
        if (dismissed) {
          setLocalPref(INTRO_PREF, true);
        } else {
          setIntroOpen(true);
        }
      });
    } else {
      setIntroOpen(true);
    }
    return () => {
      active = false;
    };
  }, [passage, authLoading, user?.id]);

  const handleIntroClose = ({ dontShowAgain }) => {
    setIntroOpen(false);
    track('listening_intro_closed', {
      dont_show_again: Boolean(dontShowAgain),
      signed_in: Boolean(user?.id),
    });
    if (!dontShowAgain) return;
    setLocalPref(INTRO_PREF, true);
    if (user?.id) saveUserPref(user.id, INTRO_PREF, true);
  };

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

  const { title, audioUrl, transcriptHtml, groups, difficulty, slug, legacyId, listeningPart } = passage;
  const pageTitle = title
    ? `${title} | IELTS Listening Practice | IELTS-Bank`
    : 'IELTS Listening Practice | IELTS-Bank';
  const metaDescription =
    description || `Practise IELTS Listening with the audio passage: ${title}.`;
  // Canonicalise to the SAME URL the sitemap emits: legacy Firestore id when one
  // exists (already-indexed URLs), otherwise the slug. Both URLs pre-render, so a
  // single stable canonical prevents duplicate-content indexing.
  const canonicalId = legacyId || slug || id || '';
  const canonicalUrl = `${SITE_URL}/listeningquestion/${encodeURIComponent(canonicalId)}`;
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
    title || 'IELTS Listening Practice'
  )}&type=listening${difficulty ? `&subtitle=${encodeURIComponent(difficulty)}` : ''}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LearningResource',
        '@id': `${canonicalUrl}#resource`,
        name: title,
        description: metaDescription,
        url: canonicalUrl,
        learningResourceType: 'IELTS Listening practice test',
        educationalUse: 'IELTS exam preparation',
        educationalLevel: difficulty || 'Intermediate to Advanced',
        inLanguage: 'en',
        isAccessibleForFree: true,
        teaches: 'IELTS Listening skills',
        about: { '@type': 'Thing', name: 'IELTS Listening' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'IELTS Listening',
            item: `${SITE_URL}/listeningquestion`,
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
          content="IELTS, IELTS Listening, IELTS Listening Questions, IELTS Practice, IELTS Test Prep"
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
        <meta property="og:image:alt" content={`IELTS Listening practice: ${title}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={`IELTS Listening practice: ${title}`} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="min-h-screen bg-background">
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              IELTS Listening Practice
              {listeningPart && <Badge variant="secondary">Part {listeningPart}</Badge>}
              {difficulty && (
                <Badge variant="emerald" className="capitalize">
                  {difficulty}
                </Badge>
              )}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            {/* Audio column (sticky on desktop) */}
            <div className="lg:sticky lg:top-20 lg:self-start">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-6 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <Headphones className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
                    Recording
                  </h2>
                </div>
                <AudioPlayer
                  src={audioUrl}
                  onPlay={() => track('audio_play', { skill: 'listening', slug: slug || id, signed_in: Boolean(user?.id) })}
                  onEnded={() => track('audio_complete', { skill: 'listening', slug: slug || id, signed_in: Boolean(user?.id) })}
                  onDurationChange={(seconds) => setAudioDuration(seconds)}
                />
                <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                  You can replay the recording as many times as you like while practising. In the
                  real exam you hear it once only.
                </p>
              </div>
            </div>

            {/* Questions column */}
            <div className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
                  Questions
                </h2>
              </div>
              <div className="px-5 py-4">
                <QuestionEngine
                  groups={groups}
                  storageKey={slug || id}
                  skill="listening"
                  durationSeconds={audioDuration ? Math.ceil(audioDuration) + 10 * 60 : null}
                  postSubmitContent={
                    transcriptHtml ? (
                      <details className="mb-6 rounded-lg border border-border bg-card">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          Show transcript
                        </summary>
                        <div
                          className="border-t border-border px-4 py-4 text-sm leading-7 text-foreground [&_p]:mb-3"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(transcriptHtml) }}
                        />
                      </details>
                    ) : null
                  }
                />
              </div>
            </div>
          </div>
          <RelatedPractice skill="listening" items={related} className="mt-10" />
        </main>

        <ListeningIntroModal open={introOpen} onClose={handleIntroClose} />
      </div>
    </>
  );
};

export default ListeningQuestion;
