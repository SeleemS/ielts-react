import { FUNNEL_VERSION } from '../lib/monetizationExperiment';
import { analyticsConsentGranted } from '../src/lib/consent';
import { normalizeUpgradeContext } from '../lib/upgradeContext';
import { practiceAllowanceCopy } from '../lib/practiceAllowance';
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
import ResumeNotice from '../src/components/billing/ResumeNotice';
import QuickCheckout from '../src/components/billing/QuickCheckout';
import { REPORT_OFFER } from '../lib/reportOffer';
import SampleReportPreview from '../src/components/SampleReportPreview';
import { TIMELINES, dailyCost, recommendedSku, timelineByKey, timelineFromExamDays } from '../src/lib/planFit';
import { FaqSection, faqJsonLdFor } from '../src/components/SectionLanding';
import { useAuth } from '../src/lib/auth';
import { useFreeSample } from '../src/lib/useFreeWritingSample';
import { IS_WEEKLY_FREE_SCORE, freeScoreCopy, nextFreeScoreHint } from '../lib/freeScorePeriod';
import { usePlan } from '../src/lib/usePlan';
import { getSupabase, getPublicTrustStats } from '../lib/supabase';
import { useVisitorMarket } from '../src/lib/useVisitorMarket';
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
import { calibrationPricingLine } from '../lib/calibrationStats';
import { cn } from '../src/lib/utils';
import SaleCountdown from '../src/components/SaleCountdown';
import {
  EXAM_PASS_DAYS,
  PASS_FIRST_LABEL,
  PROMO,
  isPromoLive,
  promoEndsAtMs,
  planLayout,
  highlightedSku,
  planPricing,
  money,
  WEEK_PASS_DAYS,
  WEEK_PASS_ENABLED,
} from '../src/lib/saleConfig';

const PAGE_TITLE = PRICING_SEO.title;
const PAGE_DESCRIPTION = PRICING_SEO.description;

// One measured accuracy claim, read from lib/calibrationStats.json at build
// time. Null (and therefore nothing rendered) until a calibration run has
// actually been done — see pages/ielts-writing-checker-accuracy.js.
const accuracyLine = calibrationPricingLine();

// Free-tier allowance copy follows NEXT_PUBLIC_FREE_SCORE_PERIOD (lifetime by
// default, weekly once consume_ai_score v10 is live) — lib/freeScorePeriod.js.
const FREE_COPY = freeScoreCopy();

// Everything Pro unlocks — shown on every Pro card and in the "Everything
// included" grid. The single Pro tier is sold three ways (Monthly, Annual, and
// the one-time Exam Pass); prices and the promo live in src/lib/saleConfig.js
// (the single source of truth).
const PRACTICE_COPY = practiceAllowanceCopy();

const FREE_INCLUDES = [
  'Every Reading & Listening question and answer key',
  PRACTICE_COPY.freeMarking,
  FREE_COPY.allowanceLine,
];

const PRO_INCLUDES = [
  ...(PRACTICE_COPY.proLine ? [PRACTICE_COPY.proLine] : []),
  'Full AI Writing reports on all four criteria',
  'AI Speaking scoring from your recordings',
  'Live AI examiner on gpt-live-1 — full-duplex, it listens while it speaks',
  'Full-length timed mock tests',
  'Writing & Speaking band trends',
  'Priority processing, completely ad-free',
];

const PERKS = [
  ...(PRACTICE_COPY.proLine ? [`${PRACTICE_COPY.proLine} with band estimates`] : []),
  'Full AI Writing reports with all four criteria and corrected examples',
  'AI Speaking scores from your recordings',
  `30–60 minutes with the live gpt-live-1 examiner on your ${EXAM_PASS_DAYS}-day pass; monthly allowances on subscriptions`,
  'Full-length timed mock tests with section breakdowns',
  'Writing and Speaking band trends on your dashboard',
  'Stronger scoring model with priority processing',
  'Completely ad-free practice',
];

const COMPARISON = [
  ['Every Reading and Listening question and answer key', true, true],
  ...(PRACTICE_COPY.proLine ? [[PRACTICE_COPY.proLine, false, true]] : []),
  [FREE_COPY.allowanceLine, true, true],
  ['Full Writing report and continued scoring', false, true],
  ['AI Speaking scoring and the live gpt-live-1 examiner', false, true],
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
    body: 'Ask within 14 days of your first purchase for a full refund — the one-time Exam Pass included. No forms to fill in.',
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
    a: 'Yes, and it covers every plan — including the one-time Exam Pass. If Pro is not right for you, ask within 14 days of your first purchase and we will refund it — no forms and no questions. The full terms are on the billing and refund page.',
  },
  {
    q: 'What is the Exam Pass?',
    a: `One payment for ${EXAM_PASS_DAYS} days of everything in Pro. It never renews and there is nothing to cancel — access simply ends on the date shown in your account. It suits a learner whose test is a few weeks away, and it is the option we recommend where cards often reject recurring payments.`,
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel a subscription whenever you like from your account and you keep Pro access until the end of the period you have already paid for. There are no cancellation fees, and the Exam Pass has nothing to cancel because it never renews.',
  },
  {
    q: 'What is free, and what needs Pro?',
    a: `${FREE_COPY.pricingFaq} Pro adds full AI Writing reports on all four criteria, AI Speaking scoring, minutes with the live gpt-live-1 examiner, timed full mocks, trend insights, and an ad-free experience.`,
  },
  {
    q: 'What exactly are the fair-use limits on Pro?',
    a: 'Pro includes up to 2 AI Writing reports per day, 10 per week and 30 per month, plus up to 1 AI Speaking score per day, 5 per week and 15 per month. All three limits apply. Daily limits reset at midnight UTC, weekly limits on Monday at midnight UTC, and monthly limits on the first day of the month at midnight UTC. Your plan also includes minutes with the live gpt-live-1 examiner, which is full-duplex — it listens while it speaks. If you reach a scoring limit, your saved feedback stays available while you wait for that allowance to reset.',
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

// The sign-in dialog restates the plan the visitor just chose, so the account
// step reads as part of buying it rather than a detour.
function signInTitle(sku, regionalPricing) {
  const plan = sku ? planPricing(sku, regionalPricing) : null;
  if (!plan) return 'Sign in to upgrade';
  return plan.isOneTime
    ? `Create your account to get the ${plan.name}`
    : `Create your account to start ${plan.name} Pro`;
}

function daysUntil(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

// The three differentiators for one plan card. Every plan unlocks the identical
// Pro tier, so the bullets describe the commitment, not the features (those are
// in the comparison table and the "Everything included" grid below).
function planPoints(plan, annualVsMonthlyPct, regionalPricing) {
  if (plan.isOneTime) {
    return [
      `Full Pro access for ${plan.days} days`,
      'One payment — it never renews',
      'Nothing to cancel; access simply ends',
      `${regionalPricing ? 30 : 60} live AI examiner minutes for your ${plan.days} days`,
    ];
  }
  if (plan.sku === 'annual') {
    return [
      'Full Pro access for 12 months',
      annualVsMonthlyPct > 0
        ? `Save ${annualVsMonthlyPct}% against paying monthly`
        : 'The lowest effective monthly rate',
      'Covers your prep and a retake cycle',
    ];
  }
  return [
    'Full Pro access, month to month',
    'Cancel in one click, anytime',
    'Best while your test date is unsettled',
  ];
}

// Optional exam-date nudge on a card. Only shown when the learner has actually
// set an exam date, and only where the plan genuinely fits that window.
function planNote(plan, { examDays, examWeeks }) {
  if (examDays == null || !examWeeks) return '';
  const weeks = `${examWeeks} ${examWeeks === 1 ? 'week' : 'weeks'}`;
  if (plan.isOneTime && examDays <= plan.days) {
    return `Your test is in ${weeks} — one pass covers it end to end.`;
  }
  if (plan.sku === 'annual' && examDays <= 90) {
    return `Your test is in ${weeks} — this covers your prep and a retake cycle.`;
  }
  return '';
}

function contextualCopy(upgrade, saved, currentReport) {
  if (currentReport) return { icon: '✍️', title: 'Unlock your saved essay feedback', body: 'Choose a plan to unlock this saved report, then revise your essay. No resubmission or extra scoring allowance needed to open it.' };
  if (upgrade === 'writing') {
    return {
      icon: '✍️',
      title: saved ? 'Your essay is saved and waiting' : 'Keep improving your Writing score',
      body: saved ? 'Return to your saved essay after checkout to request a full report.' : `Get full reports on your next essays with the ${EXAM_PASS_DAYS}-day Exam Pass.`,
    };
  }
  if (upgrade === 'speaking') {
    return {
      icon: '🎙️',
      title: saved ? 'Your recording is saved and waiting' : 'Get feedback on your Speaking',
      body: saved ? 'Return to your saved recording after checkout to request a full report.' : `Get full reports on your next recordings with the ${EXAM_PASS_DAYS}-day Exam Pass.`,
    };
  }
  if (upgrade === 'mock') {
    return {
      icon: '⏱️',
      title: 'Your mock is ready to sit',
      body: 'Unlock timed full mocks with band scoring below.',
    };
  }
  if (upgrade === 'practice') {
    return {
      icon: '📘',
      title: 'Your answers are saved and waiting',
      body: 'Return to your passage after checkout to see your score, then keep practising with unlimited marked Reading and Listening tests.',
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

function CanceledRecovery({ upgrade, saved, returnTo, passFirst = false, onSeePlans }) {
  const [reason, setReason] = React.useState('');
  const savedWork =
    saved && upgrade === 'writing'
      ? 'Your essay is still saved — nothing was lost.'
      : saved && upgrade === 'speaking'
        ? 'Your recording is still saved — nothing was lost.'
        : upgrade === 'mock'
          ? 'Your mock is still ready whenever you are.'
          : upgrade === 'practice'
            ? 'Your answers are still saved on that passage.'
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
      {returnTo ? (
        <NextLink href={returnTo} className="mt-4 inline-block font-semibold text-primary underline">
          Return to your practice
        </NextLink>
      ) : null}
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
              Free Reading and Listening practice remains available. The Exam Pass is a
              one-time payment for {EXAM_PASS_DAYS} days, with no automatic renewal.{' '}
              <button type="button" onClick={onSeePlans} className="font-semibold text-accent underline">
                Compare plans
              </button>
            </>
          ) : reason === 'unsure' ? (
            <>
              That&apos;s what the guarantee is for: try Pro for two weeks, and if it doesn&apos;t
              help, ask for your money back within 14 days and get it — no questions asked.
            </>
          ) : passFirst ? (
            <>
              Sorry about that. Cards in many regions decline automatic renewals. The
              Exam Pass is one payment with nothing to renew, so it usually goes through.{' '}
              <button type="button" onClick={onSeePlans} className="font-semibold text-accent underline">
                See the Exam Pass
              </button>{' '}
              or{' '}
              <NextLink href="/contactus" className="font-semibold text-accent underline">
                tell us what went wrong
              </NextLink>
              .
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

function ActivationChecklist({ upgrade, saved, returnTo }) {
  const first =
    upgrade === 'writing'
      ? { href: '/ielts-writing-checker', label: returnTo?.startsWith('/writing-report/') ? 'Open your full essay report' : saved ? 'Score the essay you saved' : 'Score an essay' }
      : upgrade === 'speaking'
        ? { href: '/speakingquestion', label: saved ? 'Score the recording you saved' : 'Practise Speaking' }
        : upgrade === 'mock'
          ? { href: '/mock-test', label: 'Sit the mock you opened' }
          : upgrade === 'practice'
            ? { href: '/readingquestion', label: 'Submit your saved answers' }
            : { href: '/ielts-writing-checker', label: 'Score your first essay' };
  return (
    <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <p className="font-bold">You&apos;re in. Do this first:</p>
          <div className="mt-3 flex flex-col gap-3">
            <NextLink href={returnTo || first.href} className="rounded-lg bg-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-900 no-underline shadow-sm">
              {first.label}
            </NextLink>
            <NextLink href="/speaking-examiner" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-900 no-underline shadow-sm">
              Meet your live gpt-live-1 examiner
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
  // Pass-first markets (PPP countries plus CN/HK) get the one-time pass as the
  // single primary offer and subscriptions second; see lib/billing.
  const {
    country,
    ready: countryReady,
    ppp: regionalPricing,
    passFirst,
  } = useVisitorMarket();
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
  // Set from the checkout API's `code` so a duplicate-purchase refusal can
  // point at billing management instead of just showing red text.
  const [errorCode, setErrorCode] = React.useState('');
  const [signInOpen, setSignInOpen] = React.useState(false);
  const checkoutIntentRef = React.useRef(null);
  const checkoutBusyRef = React.useRef(false);
  const [pendingSku, setPendingSku] = React.useState(null);
  const [examDate, setExamDate] = React.useState(null);
  // Exam timeline chosen on the page (or derived from a saved exam date). It
  // only changes which card is highlighted — never a price or a checkout.
  const [timeline, setTimeline] = React.useState(null);
  const [activation, setActivation] = React.useState('idle');
  const [activationOwner, setActivationOwner] = React.useState('');
  const [answeredCount, setAnsweredCount] = React.useState(0);
  // Whether the promo chrome renders. Defaults to PROMO.active for a matching
  // SSR/first paint, then refined on the client (and flipped off by the
  // countdown's onExpire) to avoid any Date-based hydration mismatch.
  const [promoLive, setPromoLive] = React.useState(PROMO.active);
  const trackedRef = React.useRef({ paywall: '', purchase: '' });

  const checkoutStatus = typeof router.query.checkout === 'string' ? router.query.checkout : '';
  const upgradeContext = normalizeUpgradeContext(router.query);
  const upgrade = upgradeContext.upgrade || '';
  const stage = upgradeContext.stage || '';
  const returnTo = upgradeContext.return_to || '';
  const sessionId = typeof router.query.session_id === 'string' ? router.query.session_id : '';
  const activationKey = `${user?.id || ''}:${sessionId}`;
  const currentActivation = activationOwner === activationKey ? activation : 'idle';
  const offer = router.query.offer === 'winback' || router.query.offer === REPORT_OFFER.code
    ? router.query.offer
    : '';
  // Display-only deadline from the offer email; checkout re-checks eligibility.
  const reportOfferEnds = offer === REPORT_OFFER.code && typeof router.query.offer_ends === 'string'
    ? Date.parse(router.query.offer_ends)
    : NaN;
  const reportOfferLive = Number.isFinite(reportOfferEnds) && reportOfferEnds > Date.now();
  const pauseActive =
    Boolean(pauseUntil) && new Date(pauseUntil).getTime() > Date.now();
  const pausePending = planStatus === 'paused';
  // A one-time Exam Pass is the only entitlement carrying an expiry. Its holder
  // still sees the plan grid (a pass can be converted into a subscription);
  // anyone holding a recurring plan sees the manage-your-plan panel instead.
  const examPassActive =
    Boolean(expiresAt) && new Date(expiresAt).getTime() > Date.now();
  const ownsSubscription =
    (isPremium && !examPassActive) || pauseActive || pausePending;
  const saved = stage === 'saved';
  const context = contextualCopy(upgrade, saved, upgrade === 'writing' && returnTo.startsWith('/writing-report/'));
  // Weekly free scores: a free learner sent here by a spent sample also sees
  // when the next free one unlocks (no query at all in lifetime mode).
  const paywallSkill = upgrade === 'speaking' ? 'speaking' : 'writing';
  const freeSample = useFreeSample(paywallSkill, {
    enabled: IS_WEEKLY_FREE_SCORE && (upgrade === 'writing' || upgrade === 'speaking'),
  });
  const refillHint =
    !isPremium && freeSample.used ? nextFreeScoreHint(freeSample.nextFreeAt, { skill: paywallSkill }) : '';
  const examDays = daysUntil(examDate);
  const examWeeks = examDays == null ? null : Math.max(1, Math.ceil(examDays / 7));

  const pricingFaqJsonLd = React.useMemo(() => faqJsonLdFor(PRICING_FAQS), []);

  // The one-time Exam Pass leads every region; all plans retain their prices.
  // Pass-first markets split it out as the primary offer. The exam-timeline
  // picker is display-only: it moves the highlight, never the layout or price.
  const layout = planLayout(passFirst);
  const chosenTimeline = timelineByKey(timeline);
  const featuredSku = chosenTimeline ? recommendedSku(timeline) : highlightedSku(regionalPricing);
  const primaryPlans = layout.primary.map((sku) => planPricing(sku, regionalPricing));
  const secondaryPlans = layout.secondary.map((sku) => planPricing(sku, regionalPricing));
  const passPricing = planPricing('exam_pass', regionalPricing);
  const monthlyPricing = planPricing('monthly', regionalPricing);
  const annualPricing = planPricing('annual', regionalPricing);
  // Genuine billing-frequency saving: a year prepaid vs twelve monthly charges.
  // Both numbers are prices we really charge, so this is not an anchor.
  const annualVsMonthlyPct =
    monthlyPricing && annualPricing
      ? Math.round((1 - annualPricing.price / (monthlyPricing.price * 12)) * 100)
      : 0;

  // A saved exam date pre-selects the matching timeline once, unless the
  // visitor has already picked one on the page.
  React.useEffect(() => {
    if (examDays == null) return;
    setTimeline((current) => current || timelineFromExamDays(examDays));
  }, [examDays]);

  React.useEffect(() => {
    // Refine the promo state on the client so an expired promo hides its chrome.
    setPromoLive(isPromoLive());
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
    if (!router.isReady || !countryReady || checkoutStatus === 'success') return;
    if (trackedRef.current.itemList) return;
    trackedRef.current.itemList = true;
    trackViewItemList(regionalPricing, upgrade || 'pricing', { pass_first: passFirst });
    trackViewPromotion('pricing_banner');
  }, [router.isReady, countryReady, checkoutStatus, regionalPricing, passFirst, upgrade]);

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
    let canceled = false;
    setActivationOwner(activationKey);
    setActivation('idle');
    if (checkoutStatus !== 'success' || !sessionId || !user?.id) return;
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
        if (canceled) return;
        if (response.ok && body.active === true) {
          if (trackedRef.current.purchase !== activationKey) {
            trackedRef.current.purchase = activationKey;
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
              recoveredFrom: body.recovered_from || null,
            });
          }
          setActivation('active');
        } else {
          setActivation('delayed');
        }
      })
      .catch(() => { if (!canceled) setActivation('delayed'); });
    return () => { canceled = true; };
  }, [activationKey, checkoutStatus, sessionId, upgrade, user?.id]);

  const authHeader = React.useCallback(async () => {
    const { accessToken, error: sessionError } = await getSessionAccess(getSupabase);
    return {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : null,
      sessionError,
    };
  }, []);

  const startCheckout = React.useCallback(async (sku, { resume = false } = {}) => {
    if (checkoutBusyRef.current) return;
    if (!resume) {
      checkoutIntentRef.current = analyticsConsentGranted() ? window.crypto?.randomUUID?.() || null : null;
    }
    const attribution = analyticsConsentGranted() && checkoutIntentRef.current
      ? { funnel_intent_id: checkoutIntentRef.current, funnel_version: FUNNEL_VERSION } : {};
    const record = (event, details = {}) => track(event, { sku, source: upgrade || 'pricing', funnel_version: FUNNEL_VERSION, ...attribution, ...details });
    if (!resume) record('plan_select', { signed_in: Boolean(user && !user.is_anonymous) });
    else record('checkout_auth_completed');
    setError('');
    setErrorCode('');
    if (!user || user.is_anonymous) {
      setPendingSku(sku);
      record('checkout_auth_open');
      setSignInOpen(true);
      return;
    }
    checkoutBusyRef.current = true;
    setBusySku(sku);
    track('checkout_start', { sku, source: upgrade || 'pricing', country, ppp: regionalPricing, pass_first: passFirst });
    // The cards are all visible at once, so choosing one IS the select_item
    // step of the GA4 funnel; begin_checkout follows immediately.
    trackSelectItem(sku, regionalPricing, { pass_first: passFirst });
    trackBeginCheckout(sku, regionalPricing, upgrade || 'pricing', { pass_first: passFirst });
    try {
      const { headers, sessionError } = await authHeader();
      if (sessionError) {
        record('checkout_client_failed', { failure_stage: 'session_lookup' });
        setError('Could not verify your signed-in session. Please refresh and try again.');
        return;
      }
      if (!headers) {
        setPendingSku(sku);
        record('checkout_auth_open', { reason: 'session_missing' });
        setSignInOpen(true);
        return;
      }
      record('checkout_request');
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ sku, offer, ga_cid: gaClientId(), ...attribution, ...normalizeUpgradeContext({ upgrade, stage, return_to: returnTo }) }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.url) {
        record('checkout_redirect_attempt');
        window.location.assign(body.url);
        return;
      }
      record('checkout_client_failed', { failure_stage: 'checkout_response', http_status: response.status });
      if (body.code === 'anonymous_user') { setPendingSku(sku); record('checkout_auth_open', { reason: 'email_required' }); setSignInOpen(true); }
      else {
        setErrorCode(body.code || '');
        setError(body.error || 'Could not start checkout. Please try again.');
      }
    } catch {
      record('checkout_client_failed', { failure_stage: 'network_or_redirect' });
      setError('Could not start checkout. Please try again.');
    } finally {
      checkoutBusyRef.current = false;
      setBusySku(null);
    }
  }, [authHeader, country, offer, regionalPricing, passFirst, upgrade, stage, returnTo, user]);

  React.useEffect(() => {
    if (!user?.id || user.is_anonymous || signInOpen || !pendingSku) return;
    const sku = pendingSku;
    setPendingSku(null);
    void startCheckout(sku, { resume: true });
  }, [pendingSku, signInOpen, startCheckout, user?.id, user?.is_anonymous]);

  const renderPlanCard = (plan) => {
    const featured = plan.sku === featuredSku;
    const alreadyOwned = plan.isOneTime && examPassActive;
    const note = planNote(plan, { examDays, examWeeks });
    return (
      <Card
        key={plan.sku}
        className={cn(
          'relative flex flex-col shadow-sm',
          featured
            ? 'border-2 border-accent bg-accent/[0.03] shadow-xl ring-1 ring-accent/10'
            : 'border-border'
        )}
      >
        {featured ? (
          <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-foreground shadow-md">
            {chosenTimeline ? 'Fits your test date' : `${EXAM_PASS_DAYS} days · no subscription`}
          </span>
        ) : null}
        <CardContent className="flex h-full flex-col p-6 pt-7">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-foreground">{plan.name}</h2>
            {plan.promo ? (
              <Badge variant="secondary" className="bg-amber-500 uppercase tracking-wide text-white">
                {PROMO.percentOff}% off
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{plan.blurb}</p>

          <div className="mt-4 flex items-baseline gap-2">
            {plan.promo ? (
              <span className="text-lg font-semibold text-muted-foreground line-through decoration-2">
                {money(plan.list)}
              </span>
            ) : null}
            <span className="text-4xl font-extrabold tracking-tight text-foreground">
              {money(plan.price)}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {plan.isOneTime
              ? `one-time · ${plan.days} days of Pro`
              : `${plan.cadence}${plan.perMonth ? ` · ≈ ${money(plan.perMonth)}/mo` : ''}`}
          </p>
          {dailyCost(plan) ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              About {money(dailyCost(plan))} a day
            </p>
          ) : null}
          {plan.isOneTime && passFirst ? (
            <p className="mt-2 inline-flex w-fit items-center rounded-md bg-accent/10 px-2 py-1 text-xs font-bold text-accent">
              {PASS_FIRST_LABEL}
            </p>
          ) : null}
          {plan.promo ? (
            <p className="mt-2 inline-flex w-fit items-center rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
              {money(plan.price)} with the {PROMO.name} until{' '}
              {new Date(PROMO.endsAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </p>
          ) : null}

          {note ? (
            <p className="mt-3 rounded-lg bg-accent/10 p-2 text-xs font-semibold text-accent">
              {note}
            </p>
          ) : null}

          <ul className="mt-5 flex flex-1 flex-col gap-2.5">
            {planPoints(plan, annualVsMonthlyPct, regionalPricing).map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span className="text-foreground">{item}</span>
              </li>
            ))}
          </ul>

          {plan.isOneTime ? (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Scoring limits: Writing up to 2/day, 10/week, 30/month;
              Speaking up to 1/day, 5/week, 15/month. All limits apply.
            </p>
          ) : null}

          <Button
            type="button"
            variant={featured ? 'accent' : 'outline'}
            aria-label={`Choose ${plan.name} plan`}
            onClick={() => startCheckout(plan.sku)}
            disabled={
              busySku !== null || planLoading || Boolean(planError) || alreadyOwned
            }
            className="mt-6 w-full"
          >
            {busySku === plan.sku ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {alreadyOwned
              ? 'Pass active'
              : plan.isOneTime
                ? `Get ${plan.days}-day Exam Pass`
                : plan.sku === 'annual'
                  ? 'Get Annual'
                  : 'Start Monthly'}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            14-day money-back guarantee ·{' '}
            {plan.isOneTime ? 'never renews' : 'cancel anytime'}
          </p>
        </CardContent>
      </Card>
    );
  };

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
            {offer === REPORT_OFFER.code ? (
              <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm font-semibold text-foreground" data-testid="report-offer">
                {reportOfferLive
                  ? `Your 48-hour offer: ${REPORT_OFFER.percentOff}% off the Week Pass, applied at checkout until ${new Date(reportOfferEnds).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
                  : 'This 48-hour offer has ended — the plans below are at their regular prices.'}
              </p>
            ) : null}
            {upgrade && !isPremium && !checkoutStatus ? (
              <QuickCheckout
                weekPercentOff={reportOfferLive ? REPORT_OFFER.percentOff : 0}
                className="mx-auto mt-4 max-w-md text-left"
                upgrade={upgrade}
                stage={stage}
                returnTo={returnTo}
                source={`${upgrade}_pricing_quick`}
                onSelect={(sku) => startCheckout(sku)}
                busySku={busySku}
                compareHref="#plans"
              />
            ) : null}
            {refillHint ? (
              <p className="mt-2 text-xs font-medium text-muted-foreground" data-testid="free-score-refill">
                Not ready to upgrade? {refillHint}
              </p>
            ) : null}
          </div>
        ) : null}

        <header className="mx-auto max-w-3xl text-center">
          <Badge variant="emerald" className="mb-3 sm:mb-4">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            IELTS-Bank Pro
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Full IELTS feedback until test day
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Full Writing and Speaking reports, the live AI speaking examiner, timed mocks and
            band trends. Pick the plan that fits your test date.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
              <ShieldCheck className="h-4 w-4 text-accent" />
              14-day money-back guarantee
            </span>
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4 text-accent" />
              Exam Pass never renews
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
          {passFirst ? (
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              Recommended for your region: the Exam Pass is {PASS_FIRST_LABEL.toLowerCase()} —
              charged once, with no card mandate to set up and nothing to cancel.
            </p>
          ) : null}
        </header>

        <ResumeNotice className="mx-auto mt-6 max-w-xl text-center" />
        {checkoutStatus === 'success' && currentActivation === 'active' ? (
          <ActivationChecklist upgrade={upgrade} saved={saved} returnTo={returnTo} />
        ) : null}
        {checkoutStatus === 'success' && currentActivation !== 'active' ? (
          <div
            role="status"
            className="mx-auto mt-6 max-w-xl rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground"
          >
            {authLoading || (user?.id && sessionId && currentActivation !== 'delayed') ? (
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
            saved={saved}
            returnTo={returnTo}
            passFirst={passFirst}
            onSeePlans={() => {
              document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        ) : null}
        {error ? (
          <div role="alert" className="mx-auto mt-6 max-w-xl rounded-lg border border-red-300 bg-red-50 p-4 text-center text-sm text-red-900">
            {error}
            {errorCode === 'already_premium' || errorCode === 'already_exam_pass' ? (
              <>
                {' '}
                <NextLink href="/billing/manage" className="font-semibold underline">
                  Manage your plan
                </NextLink>
                .
              </>
            ) : null}
          </div>
        ) : null}
        {planError ? (
          <div role="alert" className="mx-auto mt-6 max-w-xl rounded-lg border border-amber-300 bg-amber-50 p-4 text-center text-sm text-amber-900">
            {planError} Checkout is temporarily disabled so your existing access is not misrepresented.
          </div>
        ) : null}

        {ownsSubscription ? (
          <div className="mx-auto mt-8 max-w-xl rounded-xl border bg-card p-6 text-center shadow-sm">
            <p className="text-lg font-semibold">
              {pauseActive
                ? 'Your Pro plan is paused'
                : pausePending
                  ? 'Your Pro plan is resuming'
                  : 'You already have Pro — manage your plan'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pauseActive
                ? `Premium access resumes ${new Date(pauseUntil).toLocaleDateString()}.`
                : pausePending
                  ? 'Stripe is processing the scheduled resume. Access returns after payment succeeds.'
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
            {/* An Exam Pass holder keeps the plan grid: a pass can be turned
                into a subscription at any time. Only a second pass is refused
                (checkout returns already_exam_pass). */}
            {examPassActive ? (
              <div className="mx-auto mb-8 max-w-2xl rounded-xl border bg-card p-5 text-center shadow-sm">
                <p className="text-base font-semibold text-foreground">
                  Your pass ends on {new Date(expiresAt).toLocaleDateString()}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  It never renews. Subscribe below whenever you want Pro to continue past that
                  date.
                </p>
                {hasBillingAccount ? (
                  <Button asChild variant="outline" className="mt-4">
                    <NextLink href="/billing/manage" className="no-underline">
                      Manage billing
                    </NextLink>
                  </Button>
                ) : null}
              </div>
            ) : null}

            {/* Promo banner. Renders only while saleConfig's PROMO is live,
                which requires a real Stripe coupon that checkout verifies. No
                promo, no banner — and never an invented "was" price. */}
            {promoLive ? (
              <div
                role="button"
                tabIndex={0}
                aria-label="See offer prices"
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
                      <Sparkles className="h-3.5 w-3.5" /> {PROMO.name}
                    </span>
                    <p className="mt-2.5 text-lg font-extrabold tracking-tight text-amber-950 dark:text-amber-50 sm:text-xl">
                      {PROMO.percentOff}% off at checkout
                    </p>
                    <p className="mt-1 text-sm font-medium text-amber-900/80 dark:text-amber-100/80">
                      The discount is applied by Stripe when you check out.
                    </p>
                  </div>
                  <div className="shrink-0 text-center">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-900/70 dark:text-amber-100/70">
                      Ends in
                    </p>
                    <SaleCountdown targetMs={promoEndsAtMs()} onExpire={() => setPromoLive(false)} />
                  </div>
                </div>
              </div>
            ) : null}

            {/* Lead with the plan that fits the exam timeline. */}
            <div className="mx-auto max-w-3xl text-center">
              <p id="timeline-label" className="text-sm font-semibold text-foreground">
                When is your IELTS test?
              </p>
              <div
                role="group"
                aria-labelledby="timeline-label"
                className="mt-3 inline-flex flex-wrap justify-center gap-2"
              >
                {TIMELINES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={timeline === t.key}
                    onClick={() => {
                      setTimeline(t.key);
                      track('pricing_timeline_select', { timeline: t.key, sku: t.sku, source: upgrade || 'pricing' });
                    }}
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      timeline === t.key
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-border bg-card text-foreground hover:border-accent/50'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 min-h-[1.25rem] text-sm text-muted-foreground" aria-live="polite">
                {chosenTimeline ? chosenTimeline.why : 'Every plan unlocks the same Pro features — only the billing differs.'}
              </p>
            </div>

            <div id="plans" className="scroll-mt-28">
              {passFirst ? (
                <>
                  <div className="mx-auto mt-5 max-w-md">
                    {primaryPlans.map(renderPlanCard)}
                  </div>
                  <div className="mx-auto mt-10 max-w-3xl text-center">
                    <h2 className="text-base font-bold text-foreground">Prefer a subscription?</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Same Pro access, billed automatically until you cancel.
                    </p>
                  </div>
                  <div className="mx-auto mt-5 grid max-w-3xl items-stretch gap-5 md:grid-cols-2">
                    {secondaryPlans.map(renderPlanCard)}
                  </div>
                </>
              ) : (
                <div className="mx-auto mt-5 grid max-w-5xl items-stretch gap-5 md:grid-cols-3">
                  {primaryPlans.map(renderPlanCard)}
                </div>
              )}
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground">
                Every plan above unlocks the same Pro tier:
              </p>
              <ul className="mx-auto mt-3 flex max-w-4xl flex-wrap justify-center gap-2">
                {PRO_INCLUDES.map((item) => (
                  <li
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Week Pass: a low-commitment way in, kept out of the three-card
                grid so the Exam Pass stays the lead offer. Sold only while
                NEXT_PUBLIC_WEEK_PASS=1 (checkout enforces the same flag). */}
            {WEEK_PASS_ENABLED ? (
              <div className="mx-auto mt-8 max-w-5xl rounded-2xl border border-accent/30 bg-accent/[0.04] p-5" data-testid="week-pass-offer" id="week-pass">
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      Not sure yet? Week Pass — {money(planPricing('week_pass', regionalPricing).price)} once
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {WEEK_PASS_DAYS} days of Pro: unlimited marked Reading &amp; Listening practice, AI
                      Writing and Speaking scoring (fair-use limits apply) and timed mocks. Live AI
                      examiner not included. Never renews.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => startCheckout('week_pass')}
                    disabled={busySku !== null || planLoading || Boolean(planError) || examPassActive}
                  >
                    {busySku === 'week_pass' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {examPassActive ? 'Pass active' : `Try ${WEEK_PASS_DAYS} days`}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Free tier stays a single compact strip so the paid grid is
                exactly three cards. The full Free vs Pro table is below. */}
            <div className="mx-auto mt-8 max-w-5xl rounded-2xl border border-border bg-muted/40 p-5">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-bold text-foreground">Free — $0, forever</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {FREE_INCLUDES.join(' · ')}
                  </p>
                </div>
                <Button asChild variant="outline" className="shrink-0">
                  <NextLink href="/readingquestion" className="no-underline">Keep practising free</NextLink>
                </Button>
              </div>
            </div>

          </div>
        )}

        <section aria-label="Choose how you pay" className="mx-auto mt-8 max-w-3xl rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-lg font-bold">The same feedback toolkit. Two ways to start.</h2>
          {passFirst ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">The {EXAM_PASS_DAYS}-day Exam Pass is {money(passPricing.price)} USD once and ends automatically: {PASS_FIRST_LABEL.toLowerCase()}. Prefer a subscription? Monthly is {money(monthlyPricing.price)} USD/month and renews until canceled. Both have the same scoring limits.</p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Monthly is {money(monthlyPricing.price)} USD/month and renews until canceled. The {EXAM_PASS_DAYS}-day Exam Pass is {money(passPricing.price)} USD once and ends automatically. Both have the same scoring limits; choose the Pass if you prefer no renewal.</p>
          )}
          <a href="#sample-report" className="mt-3 inline-block text-sm font-semibold text-accent underline underline-offset-4">Preview a full Writing report</a>
        </section>

        <p className="mt-6 text-center text-sm font-medium text-muted-foreground">
          {FREE_COPY.pricingStart} Pro unlocks the full feedback toolkit.
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
          {/* Measured scorer accuracy. Renders NOTHING until a real calibration
              run exists (lib/calibrationStats.json), so this can never become an
              asserted "within 0.5 bands" claim like the ones competitors make. */}
          {accuracyLine ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {accuracyLine} —{' '}
              <NextLink
                href="/ielts-writing-checker-accuracy"
                className="font-semibold text-accent no-underline hover:underline"
              >
                see how we measured it
              </NextLink>
              .
            </p>
          ) : null}
          {answeredCount > 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{answeredCount.toLocaleString()}</span>{' '}
              practice questions answered on IELTS-Bank so far.
            </p>
          ) : null}
        </section>

        <SampleReportPreview
          className="mx-auto mt-20 max-w-4xl"
          title="What a full Pro report looks like"
          intro="Illustrative Writing report, not a learner testimonial or a promised score. Your free sample includes the sections marked Free. Pro unlocks newly saved Writing reports and adds full feedback to continued practice. Older samples without a saved report link cannot be expanded."
        >
          <div className="text-center">
            <a href="#plans" className="text-sm font-semibold text-accent underline underline-offset-4">
              Back to plans
            </a>
          </div>
        </SampleReportPreview>

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
        title={signInTitle(pendingSku, regionalPricing)}
        description="Next is secure Stripe checkout, backed by a 14-day money-back guarantee. You’ll stay right on this page."
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
