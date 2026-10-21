import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Card, CardContent } from '../components/ui/card';
import { SITE_URL } from '../lib/site';
import { PUBLISHER } from '../lib/publisher';

// How IELTS-Bank content is made, checked and corrected. Every statement here
// must stay true of the actual pipeline: AI-drafted from our own briefs,
// reviewed by the editor, answer keys machine-validated (lib/supabase.js
// questionIsGradeable drops anything unmarkable), listening audio is
// text-to-speech of our own scripts, practice pages carry no ads
// (src/lib/adPolicy.js). Update LAST_UPDATED when the policy changes.

const LAST_UPDATED = 'October 21, 2026';
const PAGE_TITLE = 'Editorial Policy: How We Write and Check IELTS Practice | IELTS-Bank';
const DESCRIPTION =
  'How IELTS-Bank creates, reviews and corrects its IELTS practice tests, model essays and guides — original material, checked answer keys, published scoring accuracy and a clear corrections process.';
const CANONICAL = `${SITE_URL}/editorial-policy`;

const link = 'text-primary underline-offset-2 hover:underline';

const SECTIONS = [
  {
    heading: 'Who publishes IELTS-Bank',
    body: (
      <p>
        IELTS-Bank is published by {PUBLISHER.legalName}, a company based in {PUBLISHER.country}.
        The site&rsquo;s editor decides what we publish, reviews it and is responsible for fixing
        mistakes. You can reach us at{' '}
        <a href={`mailto:${PUBLISHER.email}`} className={link}>{PUBLISHER.email}</a>.
      </p>
    ),
  },
  {
    heading: 'Everything is original',
    body: (
      <>
        <p>
          Our Reading passages, Listening scripts, Writing prompts, Speaking cue cards, model essays
          and articles are written for IELTS-Bank. We do not publish real or &ldquo;leaked&rdquo;
          exam papers, and we do not copy material from official IELTS books or other prep sites.
          Our tests follow the publicly documented IELTS format — the same parts, question types,
          word limits and timings — so practising here prepares you for the real exam without
          pretending to be it.
        </p>
      </>
    ),
  },
  {
    heading: 'How content is written',
    body: (
      <>
        <p>
          We use AI writing tools to draft practice material and articles from our own briefs: the
          IELTS part and question type being practised, the target difficulty, the skill the
          question should test and the traps it should include. The editor then reads the draft,
          checks it against the brief and the exam format, and edits or rejects it.
        </p>
        <p className="mt-2">
          Listening recordings are produced with text-to-speech from our own scripts, so the
          transcript you see after answering is exactly what the speakers say.
        </p>
      </>
    ),
  },
  {
    heading: 'How answers are checked',
    body: (
      <ul className="list-disc space-y-1 pl-6">
        <li>
          Every question has a stored answer key with accepted spellings and the word limit from its
          instructions; marking is automatic and uses the same rules as the exam (spelling counts,
          word limits count).
        </li>
        <li>
          A question that cannot be marked reliably — for example, a matching question missing its
          option list — is withheld automatically rather than shown and marked wrong.
        </li>
        <li>
          Answer-key pages explain each answer and point to the line in the passage or transcript
          that supports it, so you can check our reasoning yourself.
        </li>
      </ul>
    ),
  },
  {
    heading: 'AI band scores',
    body: (
      <p>
        Writing and Speaking feedback is produced by an AI examiner and is an estimate for practice,
        not an official result. Our{' '}
        <NextLink href="/ielts-writing-checker-accuracy" className={link}>scoring accuracy page</NextLink>{' '}
        explains how the Writing scorer works and how we measure it against essays with human band
        scores; we publish the numbers there, including where the scorer is wrong, and do not quote
        an accuracy figure anywhere until a measurement backs it.
      </p>
    ),
  },
  {
    heading: 'Corrections',
    body: (
      <p>
        If you think an answer key, explanation or article is wrong, tell us through the{' '}
        <NextLink href="/contactus" className={link}>contact page</NextLink> or at{' '}
        <a href={`mailto:${PUBLISHER.email}`} className={link}>{PUBLISHER.email}</a> with the page
        link and question number. The editor reviews every report; when we are wrong we correct the
        page, and when a disputed answer is right we explain why.
      </p>
    ),
  },
  {
    heading: 'Advertising and independence',
    body: (
      <p>
        IELTS-Bank is funded by an optional Premium plan and by advertising. Advertisers have no say
        in what we publish, and we keep ads off practice tests so they never interrupt a test you
        are taking. IELTS-Bank is independent and is not affiliated with or endorsed by the British
        Council, IDP Education or Cambridge University Press &amp; Assessment, which own and
        administer IELTS.
      </p>
    ),
  },
];

export default function EditorialPolicy() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: PAGE_TITLE,
    description: DESCRIPTION,
    url: CANONICAL,
    dateModified: '2026-10-21',
    publisher: {
      '@type': 'Organization',
      name: 'IELTS-Bank',
      legalName: PUBLISHER.legalName,
      url: SITE_URL,
      email: PUBLISHER.email,
      address: { '@type': 'PostalAddress', addressCountry: PUBLISHER.countryCode },
    },
  };

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 md:py-16">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Editorial Policy
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            How we write, check and correct the practice material on IELTS-Bank. Last updated{' '}
            {LAST_UPDATED}.
          </p>

          <Card className="mt-6">
            <CardContent className="space-y-6 pt-6 text-[15px] leading-8 text-slate-700">
              {SECTIONS.map((section) => (
                <div key={section.heading}>
                  <h2 className="mb-1 text-base font-semibold text-foreground">{section.heading}</h2>
                  {section.body}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
