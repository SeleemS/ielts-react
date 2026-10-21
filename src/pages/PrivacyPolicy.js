import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { PRIVACY_LAST_UPDATED, PRIVACY_SEO } from '../../lib/privacySeo';

const PrivacyPolicy = () => {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>{PRIVACY_SEO.title}</title>
        <meta name="description" content={PRIVACY_SEO.description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={PRIVACY_SEO.canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={PRIVACY_SEO.title} />
        <meta property="og:description" content={PRIVACY_SEO.description} />
        <meta property="og:url" content={PRIVACY_SEO.canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={PRIVACY_SEO.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={PRIVACY_SEO.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PRIVACY_SEO.title} />
        <meta name="twitter:description" content={PRIVACY_SEO.description} />
        <meta name="twitter:image" content={PRIVACY_SEO.ogImage} />
        <meta name="twitter:image:alt" content={PRIVACY_SEO.imageAlt} />
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
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {PRIVACY_LAST_UPDATED}
          </p>

          <Card className="mt-6">
            <CardContent className="space-y-5 pt-6 text-[15px] leading-8 text-slate-700">
              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">1. Introduction</h2>
                <p>
                  IELTS-Bank.com (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, share, and safeguard information when you visit our website, and describes your rights under applicable privacy laws, including the EU/UK General Data Protection Regulation (GDPR) and US state privacy laws such as the California Consumer Privacy Act (CCPA/CPRA).
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">2. Information We Collect</h2>
                <p>
                  <strong className="font-semibold text-foreground">Information you provide:</strong> Most practice content can be used without an account. If you sign in, we process your email address, account identifier, practice attempts, scores, learning preferences and quota usage so we can provide progress tracking and AI feedback. If you subscribe to updates, we store your email address and signup source. Contact-form messages are used only to respond to your request.
                </p>
                <p className="mt-2">
                  <strong className="font-semibold text-foreground">Automatically collected information:</strong> We collect standard log and device data including your IP address, browser type, operating system, referring URLs, pages visited, and time spent on pages. This is used for analytics, security, abuse prevention and site improvement.
                </p>
                <p className="mt-2">
                  <strong className="font-semibold text-foreground">Cookies and similar technologies:</strong> We and our third-party partners use cookies, local storage, and similar technologies to operate the site, analyze traffic, remember your preferences, and serve advertisements. See Sections 5 and 6 for details and your choices.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">3. Practice and AI Scoring Data</h2>
                <p>
                  Submitted Writing responses and scoring results may be stored with a signed-in learner&apos;s attempt history. A short Writing sample submitted anonymously through the Band Estimator is stored against a random browser identifier for up to 30 days so its band can be revealed after sign-up; scheduled cleanup deletes the estimator copy after that period. Speaking recordings are uploaded only for scoring and are deleted after the scoring request completes; a scheduled cleanup also removes any recording older than 30 days. Writing text and speaking audio are sent to our AI provider to generate the feedback you request. Do not submit sensitive personal information in practice answers.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">4. Payments</h2>
                <p>
                  If you purchase a premium subscription, payments are processed by Stripe, our payment processor. We do not store your full card details on our servers; Stripe processes your payment information under its own privacy policy and security standards. We retain records of your subscription status and billing history as needed to provide the service and comply with tax and accounting obligations.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">5. Advertising and Third-Party Partners</h2>
                <p>
                  We work with third-party advertising partners to display ads on our site. These include Google AdSense. These partners may use cookies, web beacons, and similar technologies to collect information about your visits to this and other websites in order to provide advertisements about goods and services of interest to you, measure ad performance, and prevent fraud.
                </p>
                <p className="mt-2">
                  Depending on your location, personalized advertising is only served with your consent (see Section 6). You can also opt out of personalized advertising through the following resources:
                </p>
                <ul className="list-disc space-y-1 pl-6">
                  <li><a href="https://www.google.com/settings/ads" className="text-primary underline-offset-2 hover:underline">Google Ads Settings</a></li>
                  <li><a href="https://optout.aboutads.info" className="text-primary underline-offset-2 hover:underline">Digital Advertising Alliance (DAA) opt-out</a></li>
                  <li><a href="https://optout.networkadvertising.org" className="text-primary underline-offset-2 hover:underline">Network Advertising Initiative (NAI) opt-out</a></li>
                  <li><a href="https://www.youronlinechoices.eu" className="text-primary underline-offset-2 hover:underline">Your Online Choices (EU)</a></li>
                </ul>
                <p className="mt-2">
                  We also use Google Analytics, Vercel Analytics and limited first-party event telemetry to understand page visits and feature usage. Anonymous telemetry uses a random identifier stored in your browser and does not include essays, transcripts, audio or email addresses. You can opt out of Google Analytics with the <a href="https://tools.google.com/dlpage/gaoptout" className="text-primary underline-offset-2 hover:underline">Google Analytics opt-out browser add-on</a>.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">6. Cookies and Consent Management</h2>
                <p>
                  Optional analytics and advertising are enabled by default. Existing saved opt-outs are respected. You can enable Global Privacy Control in a supporting browser to disable optional tracking. Essential storage supports functions such as signing in. The site does not display a cookie-consent popup.
                </p>
                <p className="mt-2">
                  Local storage also keeps in-progress answers, timer state and preferences so practice can survive a refresh. IP addresses may be processed temporarily for abuse prevention and rate limiting; old rate-limit rows are removed automatically.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">7. Legal Bases for Processing (GDPR — EEA and UK Visitors)</h2>
                <p>
                  If you are located in the European Economic Area or the United Kingdom, we process your personal data on the following legal bases:
                </p>
                <ul className="list-disc space-y-1 pl-6">
                  <li><strong className="font-semibold text-foreground">Consent</strong> — for the newsletter and for non-essential cookies and personalized advertising</li>
                  <li><strong className="font-semibold text-foreground">Contract</strong> — to provide your account, practice history, AI feedback and any subscription you purchase</li>
                  <li><strong className="font-semibold text-foreground">Legitimate interests</strong> — for site analytics, security, and non-personalized advertising</li>
                  <li><strong className="font-semibold text-foreground">Legal obligation</strong> — where processing is required to comply with applicable law</li>
                </ul>
                <p className="mt-2">
                  You have the right to access, rectify, or erase your personal data; to restrict or object to its processing; to data portability; and to withdraw consent at any time (without affecting the lawfulness of processing before withdrawal). You also have the right to lodge a complaint with your local data protection supervisory authority. To exercise any of these rights, contact us using the details in Section 13.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">8. US State Privacy Rights (California and Other States)</h2>
                <p>
                  If you are a resident of California or another US state with a comprehensive privacy law (including Virginia, Colorado, Connecticut, Utah, and Texas), you have the following rights, subject to applicable law:
                </p>
                <ul className="list-disc space-y-1 pl-6">
                  <li><strong className="font-semibold text-foreground">Right to know/access</strong> — request the categories and specific pieces of personal information we have collected about you</li>
                  <li><strong className="font-semibold text-foreground">Right to delete</strong> — request deletion of your personal information</li>
                  <li><strong className="font-semibold text-foreground">Right to correct</strong> — request correction of inaccurate personal information</li>
                  <li><strong className="font-semibold text-foreground">Right to opt out of the &quot;sale&quot; or &quot;sharing&quot; of personal information</strong> — we do not sell personal information for money, but the use of third-party advertising cookies may be considered a &quot;sale&quot; or &quot;sharing&quot; under some state laws. You can opt out via our consent banner, the opt-out links in Section 5, or by enabling the Global Privacy Control (GPC) signal in your browser, which we honor where required</li>
                  <li><strong className="font-semibold text-foreground">Right to non-discrimination</strong> — we will not discriminate against you for exercising your privacy rights</li>
                </ul>
                <p className="mt-2">
                  To exercise these rights, contact us using the details in Section 13. We will verify your request and respond within the timeframe required by law.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">9. Data Sharing and International Transfers</h2>
                <p>
                  We do not sell your personal information for money. We share information only with: (a) service providers who process data on our behalf (such as hosting, authentication, database storage, analytics, transactional email, payment processing and AI scoring); (b) advertising partners as described in Section 5; and (c) authorities where required by law. We may also share anonymized, aggregated data for analytical purposes. Where your data is transferred outside your country (including transfers from the EEA/UK to the United States), we rely on appropriate safeguards such as standard contractual clauses or our providers&apos; participation in recognized data transfer frameworks.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">10. Data Retention and Security</h2>
                <p>
                  We retain personal information only as long as necessary for the purposes described in this policy: newsletter email addresses are kept until you unsubscribe or request deletion; account and practice data are kept while your account is active or until you request deletion; analytics and log data are retained per our providers&apos; standard retention periods; and correspondence is kept as long as needed to handle your inquiry and comply with legal obligations. We use access controls, encrypted connections, row-level database policies, rate limits and restricted server credentials, but no online service can guarantee absolute security.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">11. Children&apos;s Privacy</h2>
                <p>
                  IELTS-Bank is not directed at children under 13 (or under 16 where a higher age applies). We do not knowingly collect personal information from children. If you believe a child has provided us personal information, please contact us and we will delete it.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">12. Changes to This Privacy Policy</h2>
                <p>
                  This policy is effective as of the last updated date above. We may update it in the future, with changes effective upon posting. Please check periodically.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">13. Contact Us</h2>
                <p>
                  If you have any questions about this Privacy Policy or wish to exercise any of your rights, email us at{' '}
                  <a href="mailto:hello@ielts-bank.com" className="text-primary underline-offset-2 hover:underline">hello@ielts-bank.com</a>{' '}
                  or use our <NextLink href="/contactus" className="text-primary underline-offset-2 hover:underline">contact form</NextLink>.
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

export default PrivacyPolicy;
