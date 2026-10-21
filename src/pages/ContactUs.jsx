import React, { useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { CheckCircle2, Mail, AlertCircle } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { track } from '../lib/analytics';
import { useAuth } from '../lib/auth';
import { CONTACT_SEO } from '../../lib/contactSeo';
import { PUBLISHER } from '../../lib/publisher';

const fieldClasses =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm';

const ContactUs = () => {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pending) return;

    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: (data.get('name') || '').toString(),
      email: (data.get('email') || '').toString(),
      message: (data.get('message') || '').toString(),
    };

    setPending(true);
    setError('');
    setSent(false);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Something went wrong. Please try again.');
        track('contact_submit', {
          outcome: 'error',
          signed_in: Boolean(user?.id),
          status: res.status,
        });
        return;
      }
      form.reset();
      setSent(true);
      track('contact_submit', {
        outcome: 'success',
        signed_in: Boolean(user?.id),
        status: res.status,
      });
    } catch (err) {
      setError('We could not reach the server. Please check your connection and try again.');
      track('contact_submit', {
        outcome: 'network_error',
        signed_in: Boolean(user?.id),
        status: 0,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>{CONTACT_SEO.title}</title>
        <meta name="description" content={CONTACT_SEO.description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={CONTACT_SEO.canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={CONTACT_SEO.title} />
        <meta property="og:description" content={CONTACT_SEO.description} />
        <meta property="og:url" content={CONTACT_SEO.canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={CONTACT_SEO.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={CONTACT_SEO.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={CONTACT_SEO.title} />
        <meta name="twitter:description" content={CONTACT_SEO.description} />
        <meta name="twitter:image" content={CONTACT_SEO.ogImage} />
        <meta name="twitter:image:alt" content={CONTACT_SEO.imageAlt} />
      </Head>
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6 md:py-16">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Contact Us
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              Have a question about IELTS practice or preparation? We would love
              to hear from you.
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4 text-accent" />
              Email{' '}
              <a href={`mailto:${PUBLISHER.email}`} className="font-medium text-primary underline-offset-2 hover:underline">
                {PUBLISHER.email}
              </a>{' '}
              or send a message below.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Send us a message</CardTitle>
              <CardDescription>
                We will get back to you as soon as possible.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sent && (
                <div
                  role="status"
                  className="mb-6 flex items-start gap-3 rounded-md border border-accent/30 bg-accent/10 p-4 text-sm text-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div>
                    <p className="font-semibold">Message sent!</p>
                    <p className="text-muted-foreground">
                      We will get back to you as soon as possible.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mb-6 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div>
                    <p className="font-semibold">Message not sent</p>
                    <p className="text-muted-foreground">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label
                    htmlFor="name"
                    className="text-sm font-medium text-foreground"
                  >
                    Your Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    required
                    placeholder="John Doe"
                    className={fieldClasses}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium text-foreground"
                  >
                    Email Address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="john@example.com"
                    className={fieldClasses}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="message"
                    className="text-sm font-medium text-foreground"
                  >
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={5}
                    placeholder="How can we help you?"
                    className={`${fieldClasses} resize-y`}
                  />
                </div>

                <Button
                  type="submit"
                  variant="accent"
                  className="w-full"
                  disabled={pending}
                >
                  {pending ? 'Sending…' : 'Send Message'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle as="h2">What we can help with</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-7 text-slate-700">
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong className="font-semibold text-foreground">A mistake in a question or answer key</strong> —
                  include the page link and question number. The editor checks every report, and we
                  correct the page or explain the answer (see our{' '}
                  <NextLink href="/editorial-policy" className="text-primary underline-offset-2 hover:underline">editorial policy</NextLink>).
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Premium, billing and refunds</strong> —
                  send the email address you paid with so we can find your purchase.
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Your data</strong> — requests to
                  access, export or delete your account data, as described in our{' '}
                  <NextLink href="/privacypolicy" className="text-primary underline-offset-2 hover:underline">privacy policy</NextLink>.
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Study questions, feedback and partnerships</strong> —
                  teachers and schools are welcome to get in touch.
                </li>
              </ul>
              <p className="mt-4 border-t border-border pt-4 text-muted-foreground">
                IELTS-Bank is operated by {PUBLISHER.legalName}, {PUBLISHER.country}. We are an
                independent study resource, not affiliated with the British Council, IDP or
                Cambridge — for questions about booking or sitting the IELTS test itself, contact
                your test centre.
              </p>
            </CardContent>
          </Card>

          <div className="mt-8 text-center">
            <Button asChild variant="ghost">
              <NextLink href="/" className="no-underline">
                ← Back to Homepage
              </NextLink>
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ContactUs;
