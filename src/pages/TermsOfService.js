import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { TERMS_SEO } from '../../lib/termsSeo';

const TermsOfService = () => {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>{TERMS_SEO.title}</title>
        <meta name="description" content={TERMS_SEO.description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={TERMS_SEO.canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={TERMS_SEO.title} />
        <meta property="og:description" content={TERMS_SEO.description} />
        <meta property="og:url" content={TERMS_SEO.canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={TERMS_SEO.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={TERMS_SEO.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TERMS_SEO.title} />
        <meta name="twitter:description" content={TERMS_SEO.description} />
        <meta name="twitter:image" content={TERMS_SEO.ogImage} />
        <meta name="twitter:image:alt" content={TERMS_SEO.imageAlt} />
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
            Terms of Service
          </h1>

          <Card className="mt-6">
            <CardContent className="space-y-5 pt-6 text-[15px] leading-8 text-slate-700">
              <p>
                Welcome to IELTS-Bank. Below are our Terms of Service, which outline
                the rules and regulations for the use of IELTS-Bank&apos;s Website.
              </p>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">1. Terms</h2>
                <p>
                  By accessing this website, you agree to be bound by these Terms of Service and comply with any applicable local laws.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">2. Use License</h2>
                <p>
                  Permission is granted to temporarily download one copy of the materials on IELTS-Bank&apos;s website for personal, non-commercial use only.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">3. Disclaimer</h2>
                <p>
                  The materials on IELTS-Bank’s website are provided &quot;as is.&quot; IELTS-Bank disclaims all warranties, expressed or implied.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">4. Limitations</h2>
                <p>
                  IELTS-Bank or its suppliers shall not be liable for any damages arising from the use or inability to use the website.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">5. Revisions and Errata</h2>
                <p>
                  The materials on IELTS-Bank’s website may include errors. IELTS-Bank does not guarantee their accuracy or currency.
                </p>
              </div>

              <div id="billing-refunds" className="scroll-mt-24">
                <h2 className="mb-1 text-base font-semibold text-foreground">6. Advertising, Billing and Refunds</h2>
                <p>
                  The website is supported by third-party advertising (including Google AdSense)
                  and optional paid access. Ads are provided by third parties and IELTS-Bank is not
                  responsible for the content of advertisements or the products and services they
                  promote. Payments are processed by Stripe; IELTS-Bank does not store full card
                  details.
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-6">
                  <li>
                    <strong className="font-semibold text-foreground">Subscriptions.</strong>{' '}
                    Monthly and annual plans renew automatically at the price and interval shown
                    at checkout until cancelled. Three-month and six-month plans are no longer
                    sold; where one is still held, it continues to renew on the same terms until
                    cancelled or changed. Taxes may be added where required.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">Exam Pass.</strong>{' '}
                    The Exam Pass is one payment for 30 days of Premium access. It does not renew,
                    no further payment is taken, and access ends on the date shown in your account.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">Cancellation.</strong>{' '}
                    You may cancel a subscription at any time from billing settings. Unless a
                    refund is granted, access continues through the paid billing period and no
                    further renewal is charged.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">14-day money-back guarantee.</strong>{' '}
                    You may request a refund within 14 calendar days of your first paid purchase —
                    a subscription or the one-time Exam Pass — by contacting <a href="mailto:info@ielts-bank.com" className="text-primary underline-offset-2 hover:underline">info@ielts-bank.com</a>{' '}
                    from the email on your account. The guarantee applies once per customer. We may
                    refuse requests involving fraud, chargeback abuse, material violation of these
                    terms, or substantially consumed live-examiner usage.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">Fair use.</strong>{' '}
                    Paid AI tools have clearly disclosed abuse-prevention and usage limits. We may
                    temporarily restrict automated, shared-account or excessive use that threatens
                    service availability.
                  </li>
                </ul>
                <p className="mt-3">
                  See our Privacy Policy for how advertising and payment data are handled.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">7. Site Terms of Use Modifications</h2>
                <p>
                  IELTS-Bank may revise these terms at any time without notice. By using this site, you agree to be bound by the current version.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">8. Governing Law and Disputes</h2>
                <p>
                  These Terms of Service, and any dispute arising out of or relating to
                  them or your use of the website, are governed by the laws of the State
                  of Delaware, United States, without regard to its conflict-of-law
                  principles. If you have a concern, please first contact us at{' '}
                  <a href="mailto:info@ielts-bank.com" className="text-primary underline-offset-2 hover:underline">info@ielts-bank.com</a>{' '}
                  so we can try to resolve it informally.
                </p>
                <p className="mt-3">
                  If a dispute cannot be resolved informally, you agree that it will be
                  subject to the exclusive jurisdiction of the state and federal courts
                  located in the State of Delaware, and you consent to personal
                  jurisdiction in those courts.
                </p>
                <p className="mt-3">
                  Nothing in this section removes any mandatory legal rights you have as a
                  consumer. If you are a consumer resident in a jurisdiction whose laws
                  guarantee you the protection of local consumer rules or the right to
                  bring proceedings in your own local courts (for example the United
                  Kingdom or the European Economic Area), those rights are not affected.
                </p>
              </div>

              <p>
                <strong className="font-semibold text-foreground">Last Updated:</strong> July 20, 2026
              </p>

              <p>
                If you have any questions about these Terms of Service, please contact us.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default TermsOfService;
