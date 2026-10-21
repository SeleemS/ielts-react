import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { ABOUT_SEO } from '../../lib/aboutSeo';
import { PUBLISHER } from '../../lib/publisher';

const AboutUs = () => {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>{ABOUT_SEO.title}</title>
        <meta name="description" content={ABOUT_SEO.description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={ABOUT_SEO.canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={ABOUT_SEO.title} />
        <meta property="og:description" content={ABOUT_SEO.description} />
        <meta property="og:url" content={ABOUT_SEO.canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={ABOUT_SEO.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={ABOUT_SEO.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={ABOUT_SEO.title} />
        <meta name="twitter:description" content={ABOUT_SEO.description} />
        <meta name="twitter:image" content={ABOUT_SEO.ogImage} />
        <meta name="twitter:image:alt" content={ABOUT_SEO.imageAlt} />
      </Head>
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 md:py-16">
          <Button asChild variant="ghost" className="mb-6 -ml-2">
            <NextLink href="/" className="no-underline">
              ← Back to Homepage
            </NextLink>
          </Button>

          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            About IELTS-Bank
          </h1>

          <Card className="mt-6">
            <CardContent className="space-y-5 pt-6 text-[15px] leading-8 text-slate-700">
              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Our Mission</h2>
                <p>
                  IELTS-Bank exists to make high-quality IELTS preparation accessible to everyone.
                  Test prep courses and coaching can cost hundreds of dollars — we believe learners
                  everywhere deserve free, realistic practice material and a low-risk way to
                  sample useful AI feedback before choosing Premium.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Who We Are</h2>
                <p>
                  IELTS-Bank is built and run by {PUBLISHER.legalName}, a company based in
                  {PUBLISHER.country}. We design the practice tests, write and
                  review the study guides, and build the marking and feedback tools ourselves.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">How Our Content Is Made</h2>
                <p>
                  All of our practice material is original — we never publish real or
                  &ldquo;leaked&rdquo; exam papers. Questions, model essays and articles are drafted
                  with AI writing tools from our own briefs, then read, edited and approved by our
                  editor before they go live. Every question has a checked answer key, and anything
                  that cannot be marked reliably is withheld. Our{' '}
                  <NextLink href="/editorial-policy" className="text-primary underline-offset-2 hover:underline">editorial policy</NextLink>{' '}
                  explains the full process and how to report a mistake.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">What We Offer</h2>
                <ul className="list-disc space-y-1 pl-6">
                  <li>
                    <strong className="font-semibold text-foreground">Practice questions for every skill</strong> — Reading, Writing, Listening and Speaking exercises modeled on the real exam format, organized by question type.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">AI-powered feedback</strong> — try one Writing score free; Premium unlocks the full criterion breakdown, continued Writing scoring and the Speaking Examiner.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">Full mock tests</strong> — Premium timed, exam-style practice assembled from our free question library.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">Free tools and guides</strong> — a <NextLink href="/band-calculator" className="text-primary underline-offset-2 hover:underline">band score calculator</NextLink> and a regularly updated <NextLink href="/blog" className="text-primary underline-offset-2 hover:underline">blog</NextLink> covering strategies, vocabulary and common mistakes.
                  </li>
                </ul>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">How We Keep It Free</h2>
                <p>
                  Every practice test, answer-key page, model essay and guide on IELTS-Bank is free
                  to read. A free account lets you have a limited number of tests marked; the
                  optional Premium plan unlocks unlimited marking, full AI feedback, the live
                  Speaking Examiner and timed mock mode. Advertising on our guides and articles
                  (never on practice tests) helps pay for the rest, so we can keep publishing new
                  questions while staying free for the learners who need it most.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Independence Disclaimer</h2>
                <p>
                  IELTS-Bank is an independent study resource. We are not affiliated with, endorsed
                  by, or connected to the British Council, IDP Education, or Cambridge Assessment
                  English, the organizations that own and administer the IELTS test. IELTS is a
                  registered trademark of its respective owners. Band scores estimated by our AI
                  tools are for practice purposes only and do not guarantee any official result.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Get in Touch</h2>
                <p>
                  Questions, feedback, or spotted a mistake in a question? We read everything. Reach
                  us at{' '}
                  <a href={`mailto:${PUBLISHER.email}`} className="text-primary underline-offset-2 hover:underline">{PUBLISHER.email}</a>{' '}
                  or through our <NextLink href="/contactus" className="text-primary underline-offset-2 hover:underline">contact form</NextLink>.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AboutUs;
