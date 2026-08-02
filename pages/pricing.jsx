import * as React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  Lock,
  Quote,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import SignInDialog from '../src/components/auth/SignInDialog';
import WritingScoreReport from '../src/components/question/WritingScoreReport';
import { FaqSection, faqJsonLdFor } from '../src/components/SectionLanding';
import { useAuth } from '../src/lib/auth';
import { usePlan } from '../src/lib/usePlan';
import { getSupabase, getPublicTrustStats } from '../lib/supabase';
import { isPppCountry } from '../lib/billing';
import { gaClientId, track } from '../src/lib/analytics';
import {
  trackBeginCheckout,
  trackPurchase,
  trackSelectItem,
  trackSelectPromotion,
  trackViewItemList,
  trackViewPromotion,
} from '../src/lib/ecommerce';
import { getSessionAccess } from '../src/lib/sessionAccess';
import { PRICING_SEO } from '../lib/pricingSeo';
import { cn } from '../src/lib/utils';
import SaleCountdown from '../src/components/SaleCountdown';
import {
  SALE,
  isSaleLive,
  saleEndsAtMs,
  planPricing,
  money,
  maxSavings,
  maxPercentOff,
} from '../src/lib/saleConfig';

const PAGE_TITLE = PRICING_SEO.title;
const PAGE_DESCRIPTION = PRICING_SEO.description;

// Everything Pro unlocks — shown on the Pro card and the "Everything included"
// grid. The single Pro plan is billed monthly or every 3 months; prices and the
// Summer Sale live in src/lib/saleConfig.js (the single source of truth).
const FREE_INCLUDES = [
  'Full Reading & Listening question bank',
  'Instant marking with answer keys',
  'One lifetime Writing sample score',
];

const PRO_INCLUDES = [
  'Full AI Writing reports on all four criteria',
  'AI Speaking scoring from your recordings',
  'Live AI examiner minutes every month',
  'Full-length timed mock tests',
  'Writing & Speaking band trends',
  'Priority processing, completely ad-free',
];

const PERKS = [
  'Full AI Writing reports with all four criteria and corrected examples',
  'AI Speaking scores from your recordings',
  '30–60 live AI examiner minutes per month, depending on regional plan',
  'Full-length timed mock tests with section breakdowns',
  'Writing and Speaking band trends on your dashboard',
  'Stronger scoring model with priority processing',
  'Completely ad-free practice',
];

const COMPARISON = [
  ['Reading and Listening question bank', true, true],
  ['One lifetime Writing sample score', true, true],
  ['Full Writing report and continued scoring', false, true],
  ['AI Speaking scoring and live examiner', false, true],
  ['Timed full-mock mode', false, true],
  ['Writing and Speaking trend insights', false, true],
  ['Ad-free experience', false, true],
];

// Genuine, verifiable trust signals shown near the plans. Every claim here maps
// to real behaviour: Stripe handles checkout (pages/api/billing/checkout.js),
// the refund window is in the Terms, scores are anchored to the public band
// descriptors, and subscriptions can be cancelled from the account at any time.
const TRUST_BAND = [
  {
    icon: BadgeCheck,
    title: 'Anchored to the official rubric',
    body: 'Every score maps to the public IELTS band descriptors, criterion by criterion — not a generic guess.',
  },
  {
    icon: ShieldCheck,
    title: '14-day money-back guarantee',
    body: 'Ask within 14 days of your first purchase for a full refund. No forms to fill in.',
  },
  {
    icon: Lock,
    title: 'Secure Stripe checkout',
    body: 'Payments are processed by Stripe. Your card details go straight to them — we never see or store them.',
  },
  {
    icon: RefreshCw,
    title: 'Cancel in one click',
    body: 'Manage or cancel anytime from your account. You keep access until the end of the period you have already paid for.',
  },
];

// Real student testimonials go here. Ships EMPTY on purpose — the section below
// renders nothing until this array has entries, so no invented social proof is
// ever shown. To add one, push an object of the shape:
//   { quote: 'Their essay feedback got me from 6 to 7.5.', name: 'Priya R.', detail: 'Band 7.5 · Academic' }
const TESTIMONIALS = [];

// Pricing-specific FAQs. Rendered visibly AND emitted as FAQPage JSON-LD, so the
// two must stay in sync. Copy is factual and mirrors the Terms/refund policy.
const PRICING_FAQS = [
  {
    q: 'Is there really a money-back guarantee?',
    a: 'Yes. If Pro is not right for you, ask within 14 days of your first purchase and we will refund it — no forms and no questions. The full terms are on the billing and refund page.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel whenever you like from your account and you keep Pro access until the end of the period you have already paid for. There are no cancellation fees.',
  },
  {
    q: 'What is free, and what needs Pro?',
    a: 'The full Reading and Listening question bank stays free with instant marking, and you get one lifetime Writing sample score. Pro adds full AI Writing reports on all four criteria, AI Speaking scoring, live AI examiner minutes, timed full mocks, trend insights, and an ad-free experience.',
  },
  {
    q: 'What exactly are the fair-use limits on Pro?',
    a: 'Pro includes up to 2 AI Writing reports per day and 1 AI Speaking score per day, plus your plan’s live examiner minutes each month. The caps exist to keep scoring fast and sustainable for everyone; if you hit one, it resets the next day and your saved feedback stays available.',
  },
  {
    q: 'How accurate are the AI band scores?',
    a: 'Scores are an estimate marked against the public IELTS band descriptors, criterion by criterion. Treat the band as a guide within about half a band, and use the specific per-criterion feedback and corrected sentences to improve.',
  },
  {
    q: 'Why might my price differ from someone in another country?',
    a: 'Prices are set from the region your request comes from, so learners in lower-income regions pay less. Regional pricing is applied on the server and cannot be selected in the browser.',
  },
  {
    q: 'Is my payment information secure?',
    a: 'Yes. Checkout is handled by Stripe, a PCI-compliant payment provider. Your card details go directly to Stripe — IELTS-Bank never sees or stores them.',
  },
  {
    q: 'Is IELTS-Bank affiliated with the official IELTS test?',
    a: 'No. IELTS-Bank provides original practice material and is not affiliated with or endorsed by the IELTS partners (British Council, IDP or Cambridge Assessment English).',
  },
];

const SAMPLE_FEEDBACK = {
  overallBand: 6.5,
  wordCount: 268,
  criteria: {
    taskResponse: {
      band: 6.5,
      strengths: ['Your position is clear from the introduction.'],
      improvements: ['Develop the remote-work example with a specific consequence.'],
    },
    coherenceCohesion: {
      band: 7,
      strengths: ['Paragraphing creates a logical progression.'],
      improvements: ['Reduce repeated use of “Furthermore”.'],
    },
    lexicalResource: {
      band: 6,
      strengths: ['Topic vocabulary such as “commute” is accurate.'],
      improvements: ['Replace repeated uses of “important” with precise alternatives.'],
    },
    grammaticalRange: {
      band: 6.5,
      strengths: ['You use a useful mix of simple and complex sentences.'],
      improvements: ['Check articles and prepositions in complex clauses.'],
    },
  },
  summary:
    'A well-organised response with a clear position. More specific examples and more precise vocabulary would move it toward Band 7.',
  improvements: [
    'Add a concrete example to each main idea.',
    'Vary repeated linking phrases.',
    'Proofread articles and prepositions.',
  ],
  correctedExamples: [
    {
      original: 'People can do a decision about their work.',
      suggestion: 'People can make an informed decision about their work.',
    },
  ],
};

function daysUntil(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

function contextualCopy(upgrade) {
  if (upgrade === 'writing') {
    return {
      icon: '✍️',
      title: 'Your essay is saved and waiting',
      body: 'Unlock your full score and examiner feedback below.',
    };
  }
  if (upgrade === 'speaking') {
    return {
      icon: '🎙️',
      title: 'Your recording is saved and waiting',
      body: 'Unlock your score and full examiner feedback below.',
    };
  }
  if (upgrade === 'mock') {
    return {
      icon: '⏱️',
      title: 'Your mock is ready to sit',
      body: 'Unlock timed full mocks with band scoring below.',
    };
  }
  return null;
}

// Shown when Stripe checkout is abandoned (?checkout=canceled). Restates the
// guarantee, reminds the user their work is saved, and asks a one-tap
// "what stopped you?" question whose answer is tracked and gets a tailored
// response. No dark patterns: canceling stays a fully respected choice.
const CANCEL_REASONS = [
  { key: 'price', label: 'The price' },
  { key: 'unsure', label: 'Not sure it will help' },
  { key: 'payment', label: 'Payment problem' },
];

function CanceledRecovery({ upgrade, perMonthText, onSeePlans }) {
  const [reason, setReason] = React.useState('');
  const savedWork =
    upgrade === 'writing'
      ? 'Your essay is still saved — nothing was lost.'
      : upgrade === 'speaking'
        ? 'Your recording is still saved — nothing was lost.'
        : upgrade === 'mock'
          ? 'Your mock is still ready whenever you are.'
          : '';
  return (
    <div className="mx-auto mt-6 max-w-xl rounded-xl border bg-card p-5 text-center shadow-sm">
      <p className="text-sm font-semibold text-foreground">
        Checkout canceled — no charge was made.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {savedWork ? `${savedWork} ` : ''}
        If you change your mind, every plan comes with a 14-day money-back
        guarantee — no forms, no questions.
      </p>
      {reason === '' ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mind telling us what stopped you?
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {CANCEL_REASONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  setReason(r.key);
                  track('checkout_canceled_reason', { reason: r.key, upgrade: upgrade || 'none' });
                }}
                className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent/10"
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {reason === 'price' ? (
            <>
              Fair enough. The 3-month plan works out to{' '}
              {perMonthText ? <strong>{perMonthText}/month</strong> : 'less per month'} — and
              prices are already set for your region.{' '}
              <button type="button" onClick={onSeePlans} className="font-semibold text-accent underline">
                Compare plans
              </button>
            </>
          ) : reason === 'unsure' ? (
            <>
              That&apos;s what the guarantee is for: try Pro for two weeks, and if it doesn&apos;t
              help, ask for your money back within 14 days and get it — no questions asked.
            </>
          ) : (
            <>
              Sorry about that. A different card usually fixes it — or{' '}
              <NextLink href="/contactus" className="font-semibold text-accent underline">
                tell us what went wrong
              </NextLink>{' '}
              and we&apos;ll sort it out.
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActivationChecklist({ upgrade }) {
  const first =
    upgrade === 'writing'
      ? { href: '/ielts-writing-checker', label: 'Score the essay you saved' }
      : upgrade === 'speaking'
        ? { href: '/speakingquestion', label: 'Score the recording you saved' }
        : upgrade === 'mock'
          ? { href: '/mock-test', label: 'Sit the mock you opened' }
          : { href: '/ielts-writing-checker', label: 'Score your first essay' };
  return (
    <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <p className="font-bold">You&apos;re in. Do this first:</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <NextLink href={first.href} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-900 no-underline shadow-sm">
              {first.label}
            </NextLink>
            <NextLink href="/speaking-examiner" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-900 no-underline shadow-sm">
              Meet your live examiner
            </NextLink>
            <NextLink href="/mock-test" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-900 no-underline shadow-sm">
              Sit a timed mock
            </NextLink>
          </div>
        </div>
      </div>
    </div>
  );
}

// Genuine student testimonials, rendered only when TESTIMONIALS has entries.
function Testimonials({ items }) {
  if (!items?.length) return null;
  return (
    <section className="mx-auto mt-20 max-w-5xl">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">In their words</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">What students say</h2>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t, i) => (
          <figure
            key={t.name ? `${t.name}-${i}` : i}
            className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            <Quote className="h-7 w-7 text-accent/40" aria-hidden />
            <blockquote className="mt-3 flex-1 text-sm leading-6 text-foreground">
              “{t.quote}”
            </blockquote>
            <figcaption className="mt-5 border-t border-border pt-4">
              <span className="text-sm font-semibold text-foreground">{t.name}</span>
              {t.detail ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">{t.detail}</span>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function PricingPage() {
  // The page is statically generated (it was SSR'd purely to read the geo
  // header, costing ~500ms TTFB on the top conversion page). Geo now arrives
  // via the middleware's ib_country cookie, read after hydration; the page
  // first paints with standard pricing and flips to the regional rate on
  // mount. Checkout re-resolves geography server-side, so this is display-only.
  const [country, setCountry] = React.useState('');
  const regionalPricing = isPppCountry(country);

  React.useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)ib_country=([A-Z]{2})/);
    if (match) setCountry(match[1]);
  }, []);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    isPremium,
    planStatus,
    renewsAt,
    expiresAt,
    pauseUntil,
    hasBillingAccount,
    loading: planLoading,
    error: planError,
  } = usePlan();
  const [busySku, setBusySku] = React.useState(null);
  const [error, setError] = React.useState('');
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [pendingSku, setPendingSku] = React.useState(null);
  const [examDate, setExamDate] = React.useState(null);
  const [activation, setActivation] = React.useState('idle');
  const [answeredCount, setAnsweredCount] = React.useState(0);
  // Pro billing cadence selected by the toggle; defaults to 3 months (best
  // value) so the higher-ARPU plan leads, with Monthly one tap away.
  const [cadence, setCadence] = React.useState('3month');
  // Whether the Summer Sale chrome renders. Defaults to SALE.active for a
  // matching SSR/first paint, then refined on the client (and flipped off by
  // the countdown's onExpire) to avoid any Date-based hydration mismatch.
  const [saleLive, setSaleLive] = React.useState(SALE.active);
  const trackedRef = React.useRef({ paywall: '', purchase: '' });

  const checkoutStatus = typeof router.query.checkout === 'string' ? router.query.checkout : '';
  const upgrade =
    router.query.upgrade === 'writing' ||
    router.query.upgrade === 'speaking' ||
    router.query.upgrade === 'mock'
      ? router.query.upgrade
      : '';
  const sessionId = typeof router.query.session_id === 'string' ? router.query.session_id : '';
  const offer = router.query.offer === 'winback' ? 'winback' : '';
  const pauseActive =
    Boolean(pauseUntil) && new Date(pauseUntil).getTime() > Date.now();
  const pausePending = planStatus === 'paused';
  const context = contextualCopy(upgrade);
  const examDays = daysUntil(examDate);
  const examWeeks = examDays == null ? null : Math.max(1, Math.ceil(examDays / 7));

  const pricingFaqJsonLd = React.useMemo(() => faqJsonLdFor(PRICING_FAQS), []);

  // Resolve the region's numbers for both cadences (sale price = real price;
  // regular = struck anchor). PPP keeps the lower regional prices.
  const monthlyPricing = planPricing('monthly', regionalPricing);
  const threeMonthPricing = planPricing('3month', regionalPricing);
  const proPricing = cadence === 'monthly' ? monthlyPricing : threeMonthPricing;
  // Savings from paying every 3 months vs month-to-month (billing-frequency
  // discount shown on the toggle), independent of the sale.
  const quarterVsMonthlyPct =
    monthlyPricing && threeMonthPricing
      ? Math.round((1 - threeMonthPricing.sale / (monthlyPricing.sale * 3)) * 100)
      : 0;
  const saleBestSavings = maxSavings(regionalPricing);

  React.useEffect(() => {
    // Refine the sale state on the client so an expired sale hides its chrome.
    setSaleLive(isSaleLive());
  }, []);

  React.useEffect(() => {
    if (!router.isReady || !upgrade || trackedRef.current.paywall === upgrade) return;
    trackedRef.current.paywall = upgrade;
    track('paywall_view', { source: upgrade });
  }, [router.isReady, upgrade]);

  // GA4 monetization funnel: one plan-list impression (plus the sale
  // promotion impression) per pricing view. Skipped on the checkout-success
  // return so activation views don't count as shopping impressions.
  React.useEffect(() => {
    if (!router.isReady || checkoutStatus === 'success') return;
    if (trackedRef.current.itemList) return;
    trackedRef.current.itemList = true;
    trackViewItemList(regionalPricing, upgrade || 'pricing');
    if (isSaleLive()) trackViewPromotion('pricing_banner');
  }, [router.isReady, checkoutStatus, regionalPricing, upgrade]);

  const selectCadence = React.useCallback(
    (nextCadence) => {
      setCadence(nextCadence);
      trackSelectItem(nextCadence, regionalPricing);
    },
    [regionalPricing]
  );

  // Live, real social proof: total practice questions answered across all
  // learners. Fetched client-side; renders only if the RPC returns a count.
  React.useEffect(() => {
    let active = true;
    getPublicTrustStats()
      .then((stats) => {
        if (active) setAnsweredCount(Number(stats?.questionsAnswered || 0));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!user?.id) return;
    getSupabase()
      .from('users')
      .select('exam_date, prefs')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setExamDate(data?.exam_date || data?.prefs?.examDate || null))
      .catch(() => {});
  }, [user?.id]);

  React.useEffect(() => {
    if (checkoutStatus !== 'success' || !sessionId || !user?.id) return;
    if (trackedRef.current.purchase === sessionId) return;
    trackedRef.current.purchase = sessionId;
    setActivation('checking');
    getSupabase()
      .auth.getSession()
      .then(({ data }) =>
        fetch('/api/billing/verify-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data?.session?.access_token || ''}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        })
      )
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (response.ok && body.active === true) {
          track('purchase_success', { source: upgrade || 'pricing' });
          // GA4 Monetization purchase: session id as transaction_id (GA and
          // the webhook Measurement Protocol backstop dedupe on it), amount
          // from the verified session so coupons report the charged price.
          trackPurchase({
            transactionId: sessionId,
            sku: body.sku,
            ppp: body.ppp === true,
            amountMinor: body.amount_total,
            currency: body.currency || 'USD',
            source: upgrade || 'pricing',
          });
          setActivation('active');
        } else {
          setActivation('delayed');
        }
      })
      .catch(() => setActivation('delayed'));
  }, [checkoutStatus, sessionId, upgrade, user?.id]);

  const authHeader = React.useCallback(async () => {
    const { accessToken, error: sessionError } = await getSessionAccess(getSupabase);
    return {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : null,
      sessionError,
    };
  }, []);

  const startCheckout = React.useCallback(async (sku) => {
    setError('');
    if (!user) {
      setPendingSku(sku);
      setSignInOpen(true);
      return;
    }
    setBusySku(sku);
    track('checkout_start', { sku, source: upgrade || 'pricing', country, ppp: regionalPricing });
    trackBeginCheckout(sku, regionalPricing, upgrade || 'pricing');
    try {
      const { headers, sessionError } = await authHeader();
      if (sessionError) {
        setError('Could not verify your signed-in session. Please refresh and try again.');
        return;
      }
      if (!headers) {
        setSignInOpen(true);
        return;
      }
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ sku, offer, ga_cid: gaClientId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      if (body.code === 'anonymous_user') setSignInOpen(true);
      else setError(body.error || 'Could not start checkout. Please try again.');
    } catch {
      setError('Could not start checkout. Please try again.');
    } finally {
      setBusySku(null);
    }
  }, [authHeader, country, offer, regionalPricing, upgrade, user]);

  React.useEffect(() => {
    if (!user?.id || signInOpen || !pendingSku) return;
    const sku = pendingSku;
    setPendingSku(null);
    void startCheckout(sku);
  }, [pendingSku, signInOpen, startCheckout, user?.id]);

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <link rel="canonical" href={PRICING_SEO.canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={PRICING_SEO.canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={PRICING_SEO.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={PRICING_SEO.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={PRICING_SEO.ogImage} />
        <meta name="twitter:image:alt" content={PRICING_SEO.imageAlt} />
        {pricingFaqJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(pricingFaqJsonLd).replace(/</g, '\\u003c'),
            }}
          />
        ) : null}
      </Head>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10">
        {context ? (
          <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-primary/25 bg-primary/5 p-4 text-center">
            <p className="text-lg font-bold text-foreground">
              <span aria-hidden="true">{context.icon}</span> {context.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{context.body}</p>
          </div>
        ) : null}

        <header className="mx-auto max-w-3xl text-center">
          <Badge variant="emerald" className="mb-4">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            IELTS-Bank Pro
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Know exactly what is holding your IELTS band back
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Keep the free question library. Add full rubric-anchored Writing and Speaking
            feedback, live examiner practice, timed mocks, and trend insights.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
              <ShieldCheck className="h-4 w-4 text-accent" />
              14-day money-back guarantee
            </span>
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4 text-accent" />
              Cancel anytime
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-accent" />
              Secure checkout via Stripe
            </span>
          </div>
          {regionalPricing ? (
            <p className="mt-4 text-sm font-semibold text-primary">
              Priced for your region{country ? ` (${country})` : ''} — your regional rate is shown below.
            </p>
          ) : null}
        </header>

        {checkoutStatus === 'success' && activation === 'active' ? (
          <ActivationChecklist upgrade={upgrade} />
        ) : null}
        {checkoutStatus === 'success' && activation !== 'active' ? (
          <div
            role="status"
            className="mx-auto mt-6 max-w-xl rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground"
          >
            {authLoading || (user?.id && sessionId && activation !== 'delayed') ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Confirming Pro access…
              </>
            ) : !sessionId ? (
              'This checkout return is missing its verification reference. Open Pricing from your account and try again.'
            ) : !user?.id ? (
              'Sign in with the account used at checkout to confirm Pro access.'
            ) : (
              'Pro access could not be confirmed yet. If checkout completed, wait a moment and refresh while signed in to the purchasing account.'
            )}
          </div>
        ) : null}
        {checkoutStatus === 'canceled' ? (
          <CanceledRecovery
            upgrade={upgrade}
            perMonthText={threeMonthPricing?.perMonth ? money(threeMonthPricing.perMonth) : ''}
            onSeePlans={() => {
              document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        ) : null}
        {error ? (
          <div role="alert" className="mx-auto mt-6 max-w-xl rounded-lg border border-red-300 bg-red-50 p-4 text-center text-sm text-red-900">
            {error}
          </div>
        ) : null}
        {planError ? (
          <div role="alert" className="mx-auto mt-6 max-w-xl rounded-lg border border-amber-300 bg-amber-50 p-4 text-center text-sm text-amber-900">
            {planError} Checkout is temporarily disabled so your existing access is not misrepresented.
          </div>
        ) : null}

        {isPremium || pauseActive || pausePending ? (
          <div className="mx-auto mt-8 max-w-xl rounded-xl border bg-card p-6 text-center shadow-sm">
            <p className="text-lg font-semibold">
              {pauseActive
                ? 'Your Pro plan is paused'
                : pausePending
                  ? 'Your Pro plan is resuming'
                  : 'Your Pro tools are active ✨'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pauseActive
                ? `Premium access resumes ${new Date(pauseUntil).toLocaleDateString()}.`
                : pausePending
                  ? 'Stripe is processing the scheduled resume. Access returns after payment succeeds.'
                : expiresAt
                ? `Your Exam Pass is active until ${new Date(expiresAt).toLocaleDateString()}.`
                : planStatus === 'canceled' && renewsAt
                  ? `Your plan stays active until ${new Date(renewsAt).toLocaleDateString()}.`
                  : renewsAt
                    ? `Renews on ${new Date(renewsAt).toLocaleDateString()}.`
                    : 'Thanks for supporting IELTS Bank.'}
            </p>
            {hasBillingAccount ? (
              <Button asChild variant="outline" className="mt-4">
                <NextLink href="/billing/manage" className="no-underline">
                  Manage billing
                </NextLink>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="mt-10">
            {/* Summer Sale banner + live countdown. Hidden once the sale ends
                (the sale price then simply becomes the plain Pro price). */}
            {saleLive ? (
              <div
                role="button"
                tabIndex={0}
                aria-label="See sale prices"
                onClick={() => {
                  trackSelectPromotion('pricing_banner');
                  document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    trackSelectPromotion('pricing_banner');
                    document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="mx-auto mb-9 max-w-4xl cursor-pointer overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 shadow-sm transition-shadow hover:shadow-md dark:border-amber-500/30 dark:from-amber-500/10 dark:via-orange-500/10 dark:to-amber-500/10"
              >
                <div className="flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:justify-between sm:p-6 sm:text-left">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
                      <Sparkles className="h-3.5 w-3.5" /> {SALE.name}
                    </span>
                    <p className="mt-2.5 text-lg font-extrabold tracking-tight text-amber-950 dark:text-amber-50 sm:text-xl">
                      Up to {maxPercentOff(regionalPricing)}% off Pro — save up to {money(saleBestSavings)}
                    </p>
                    <p className="mt-1 text-sm font-medium text-amber-900/80 dark:text-amber-100/80">
                      {SALE.tagline}
                    </p>
                  </div>
                  <div className="shrink-0 text-center">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-900/70 dark:text-amber-100/70">
                      Ends in
                    </p>
                    <SaleCountdown targetMs={saleEndsAtMs()} onExpire={() => setSaleLive(false)} />
                  </div>
                </div>
              </div>
            ) : null}

            {/* Billing cadence toggle — 3 months leads (best value). */}
            <div className="flex justify-center">
              <div
                role="tablist"
                aria-label="Billing period"
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={cadence === 'monthly'}
                  onClick={() => selectCadence('monthly')}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                    cadence === 'monthly'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={cadence === '3month'}
                  onClick={() => selectCadence('3month')}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                    cadence === '3month'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  3 months
                  {quarterVsMonthlyPct > 0 ? (
                    <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                      Save {quarterVsMonthlyPct}%
                    </span>
                  ) : null}
                </button>
              </div>
            </div>

            {/* Free vs Pro — the core comparison. */}
            <div id="plans" className="mx-auto mt-8 grid max-w-4xl items-stretch gap-5 md:grid-cols-2">
              <Card className="flex flex-col border-border shadow-sm">
                <CardContent className="flex h-full flex-col p-6">
                  <h2 className="text-base font-bold text-foreground">Free</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Practise the question bank, forever.</p>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-4xl font-extrabold tracking-tight text-foreground">$0</span>
                    <span className="text-sm font-medium text-muted-foreground">/ forever</span>
                  </div>
                  <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                    {FREE_INCLUDES.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                        <span className="text-foreground">{item}</span>
                      </li>
                    ))}
                    <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                      <span>No AI Writing / Speaking feedback, examiner, or mocks</span>
                    </li>
                  </ul>
                  <Button asChild variant="outline" className="mt-6 w-full">
                    <NextLink href="/reading" className="no-underline">Keep practising free</NextLink>
                  </Button>
                </CardContent>
              </Card>

              <Card className="relative flex flex-col border-2 border-accent bg-accent/[0.03] shadow-xl ring-1 ring-accent/10">
                <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-foreground shadow-md">
                  Most popular
                </span>
                <CardContent className="flex h-full flex-col p-6 pt-7">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-foreground">Pro</h2>
                    {saleLive ? (
                      <Badge variant="secondary" className="bg-amber-500 uppercase tracking-wide text-white">
                        {SALE.name}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">Everything you need to lift your band.</p>

                  <div className="mt-4 flex items-baseline gap-2">
                    {saleLive ? (
                      <span className="text-lg font-semibold text-muted-foreground line-through decoration-2">
                        {money(proPricing.regular)}
                      </span>
                    ) : null}
                    <span className="text-4xl font-extrabold tracking-tight text-foreground">
                      {money(proPricing.sale)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-muted-foreground">
                    {proPricing.cadence}
                    {proPricing.perMonth ? ` · ≈ ${money(proPricing.perMonth)}/mo` : ''}
                  </p>
                  {saleLive && proPricing.savings > 0 ? (
                    <p className="mt-2 inline-flex w-fit items-center rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                      Save {money(proPricing.savings)} · {proPricing.percentOff}% off — ends{' '}
                      {new Date(SALE.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  ) : null}

                  {cadence === '3month' && examWeeks && examDays <= 90 ? (
                    <p className="mt-3 rounded-lg bg-accent/10 p-2 text-xs font-semibold text-accent">
                      Your test is in {examWeeks} {examWeeks === 1 ? 'week' : 'weeks'} — this plan
                      covers your prep{examDays <= 45 ? ' and a retake cycle' : ''}.
                    </p>
                  ) : null}

                  <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                    {PRO_INCLUDES.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                        <span className="text-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    type="button"
                    variant="accent"
                    aria-label={`Choose ${proPricing.name} plan`}
                    onClick={() => startCheckout(cadence)}
                    disabled={busySku !== null || planLoading || Boolean(planError)}
                    className="mt-6 w-full"
                  >
                    {busySku === cadence ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Choose this plan
                  </Button>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    14-day money-back guarantee · cancel anytime
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-sm font-medium text-muted-foreground">
          Start with one free Writing sample score. Pro unlocks the full feedback toolkit.
        </p>

        {/* Genuine trust signals — every claim maps to real behaviour. */}
        <section className="mt-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_BAND.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-foreground">{title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
          {answeredCount > 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{answeredCount.toLocaleString()}</span>{' '}
              practice questions answered on IELTS-Bank so far.
            </p>
          ) : null}
        </section>

        <section className="mx-auto mt-20 max-w-4xl">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">See the product</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">What your full feedback looks like</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This example uses the same report layout you receive after scoring.
            </p>
          </div>
          <div className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <WritingScoreReport task={2} result={SAMPLE_FEEDBACK} sample />
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-4xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Free practice or Pro feedback?</h2>
          <div className="mt-8 overflow-hidden rounded-2xl border border-border shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-4 py-3 font-semibold text-foreground sm:px-6">Feature</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Free</th>
                  <th className="px-4 py-3 text-center font-semibold text-accent">Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, free, premium]) => (
                  <tr key={label} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-foreground sm:px-6">{label}</td>
                    <td className="px-4 py-3 text-center">
                      {free ? (
                        <Check className="mx-auto h-4 w-4 text-accent" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-muted-foreground/40" />
                      )}
                    </td>
                    <td className="bg-accent/[0.04] px-4 py-3 text-center">
                      {premium ? (
                        <Check className="mx-auto h-4 w-4 text-accent" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-muted-foreground/40" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Everything included</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3.5 text-sm shadow-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span className="text-foreground">{perk}</span>
              </li>
            ))}
          </ul>
        </section>

        <Testimonials items={TESTIMONIALS} />

        <section className="mx-auto mt-20 grid max-w-4xl gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </span>
              <h2 className="font-bold text-foreground">Why not use a generic chatbot?</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Generic chatbots can over-score IELTS essays and often skip Task Response. IELTS Bank
              anchors every score to the public band descriptors, criterion by criterion, and shows
              the reasoning and corrections behind the estimate.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h2 className="font-bold text-foreground">What if it is not right for me?</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Ask within 14 days of your first purchase for a refund. Cancel anytime from your
              account; access continues to the end of the period you have already paid for.
            </p>
            <NextLink href="/termsofservice#billing-refunds" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Read the billing and refund terms <ArrowRight className="h-3.5 w-3.5" />
            </NextLink>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-3xl">
          <FaqSection faqs={PRICING_FAQS} />
        </section>

        <div className="mx-auto mt-12 flex max-w-3xl items-start gap-3 rounded-xl bg-muted/50 p-4 text-xs leading-5 text-muted-foreground">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Regional pricing is selected on the server from request geography and cannot be
            chosen by the browser. Fair-use limits keep scoring responsive. IELTS Bank is not
            affiliated with or endorsed by the IELTS partners.
          </p>
        </div>
      </main>
      <Footer />
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        title="Sign in to upgrade"
        description="Create your account or sign in — you’ll stay right on this page."
        trigger="pricing_upgrade"
        redirectOnFinish={false}
      />
    </>
  );
}

export function getStaticProps() {
  // Static + hourly ISR: the page itself has no per-request data (geo is a
  // client-side cookie read), so serve it from the CDN like the rest of the
  // site instead of invoking a lambda per visit.
  return { props: {}, revalidate: 3600 };
}
