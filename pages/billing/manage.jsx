import * as React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowUpCircle, CalendarClock, CreditCard, Loader2, PauseCircle, ShieldCheck } from 'lucide-react';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import { Button } from '../../components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { useAuth } from '../../src/lib/auth';
import { usePlan } from '../../src/lib/usePlan';
import { getSupabase } from '../../lib/supabase';
import { track } from '../../src/lib/analytics';
import { billingStatusMessage, canOfferBillingPause } from '../../src/lib/billingStatus';
import { getSessionAccess } from '../../src/lib/sessionAccess';
import Modal from '../../src/components/AccessibleModal';

async function authHeaders() {
  const { accessToken, error } = await getSessionAccess(getSupabase);
  if (error) {
    throw new Error('Could not verify your signed-in session. Please refresh and try again.');
  }
  if (!accessToken) throw new Error('Please sign in again.');
  return { Authorization: `Bearer ${accessToken}` };
}

function formatMoney(amountMinor, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
    currencyDisplay: 'code',
  }).format(Number(amountMinor || 0) / 100);
}

function cadenceLabel(quote) {
  if (quote?.interval === 'year' && quote?.intervalCount === 1) return 'per year';
  if (quote?.interval === 'month' && quote?.intervalCount === 1) return 'per month';
  return `every ${quote?.intervalCount || ''} ${quote?.interval || ''}s`.trim();
}

export default function ManageBillingPage() {
  const { user, loading: authLoading } = useAuth();
  const {
    isPremium,
    planSku,
    planStatus,
    renewsAt,
    expiresAt,
    pauseUntil,
    pauseUsedAt,
    hasBillingAccount,
    loading,
    error: planError,
  } = usePlan();
  const [busy, setBusy] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [pauseResult, setPauseResult] = React.useState(null);
  const [upgradeQuote, setUpgradeQuote] = React.useState(null);
  const [quoteMessage, setQuoteMessage] = React.useState('');
  // One honest pre-portal step for ACTIVE subscribers heading toward cancel:
  // pause is usually the better fit for a test-prep gap, and returning
  // subscribers get the win-back discount later. One screen, one clear
  // "continue to cancel" — no dark patterns, shown at most once per visit.
  const [saveStepSeen, setSaveStepSeen] = React.useState(false);
  const [saveStepOpen, setSaveStepOpen] = React.useState(false);

  async function openPortal() {
    setBusy('portal');
    setError('');
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: await authHeaders(),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) throw new Error(body.error || 'Could not open billing settings.');
      window.location.assign(body.url);
    } catch (portalError) {
      setError(portalError.message);
      setBusy('');
    }
  }

  async function pausePlan() {
    setBusy('pause');
    setError('');
    try {
      const response = await fetch('/api/billing/pause', {
        method: 'POST',
        headers: await authHeaders(),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not pause the subscription.');
      track('subscription_pause', { source: 'billing_interstitial' });
      setPauseResult({
        resumesAt: body.resumesAt,
        usedAt: new Date().toISOString(),
      });
      setMessage(`Billing and Premium access are paused until ${new Date(body.resumesAt).toLocaleDateString()}. Stripe will apply your unused-time credit when billing resumes.`);
    } catch (pauseError) {
      setError(pauseError.message);
    } finally {
      setBusy('');
    }
  }

  async function upgradePlan(sku, acceptedQuote = null) {
    setBusy(`upgrade:${sku}`);
    setError('');
    setMessage('');
    setQuoteMessage('');
    try {
      const response = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers: {
          ...(await authHeaders()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          acceptedQuote
            ? {
                sku,
                action: 'confirm',
                acceptedAmount: acceptedQuote.amountDue,
                acceptedCurrency: acceptedQuote.currency,
                prorationDate: acceptedQuote.prorationDate,
                quoteToken: acceptedQuote.token,
              }
            : { sku, action: 'preview' }
        ),
      });
      const body = await response.json().catch(() => ({}));
      if (body.requiresConfirmation && body.quote) {
        setUpgradeQuote(body.quote);
        setQuoteMessage(response.ok ? '' : body.error || 'Review the updated estimate.');
        return;
      }
      if (body.url) {
        window.location.assign(body.url);
        return;
      }
      if (!response.ok || body.changed !== true) {
        throw new Error(body.error || 'Could not upgrade the plan.');
      }
      track('subscription_plan_change', { from_sku: planSku, to_sku: sku });
      // In-place upgrades never pass through Checkout, so report the prorated
      // charge as its own GA4 purchase. prorationDate keeps the id unique and
      // stable across retries of the same accepted quote.
      if (acceptedQuote) {
        track('purchase', {
          transaction_id: `upgrade_${sku}_${acceptedQuote.prorationDate}`,
          value: Math.round(Number(acceptedQuote.amountDue)) / 100,
          currency: String(acceptedQuote.currency || 'usd').toUpperCase(),
          items: [
            {
              item_id: `pro_${sku}`,
              item_name: `Pro upgrade to ${sku}`,
              item_category: 'subscription_upgrade',
              price: Math.round(Number(acceptedQuote.amountDue)) / 100,
              quantity: 1,
            },
          ],
          sku,
          value_source: 'proration',
        });
      }
      setUpgradeQuote(null);
      setMessage(body.message || 'Your plan was upgraded.');
    } catch (upgradeError) {
      setError(upgradeError.message);
    } finally {
      setBusy('');
    }
  }

  const pending = authLoading || loading;
  const effectivePauseUntil = pauseResult?.resumesAt || pauseUntil;
  const effectivePauseUsedAt = pauseResult?.usedAt || pauseUsedAt;
  const pauseActive =
    Boolean(effectivePauseUntil) &&
    new Date(effectivePauseUntil).getTime() > Date.now();
  const pausePending = planStatus === 'paused';
  const canChangeRecurringPlan =
    isPremium
    && ['monthly', '3month', '6month', 'annual'].includes(planSku)
    && ['active', 'trialing'].includes(planStatus);
  // Annual is the only upgrade target on sale. Monthly and the retired
  // 3-month/6-month plans can all move up to it in place.
  const upgrades =
    canChangeRecurringPlan && ['monthly', '3month', '6month'].includes(planSku)
      ? [{ sku: 'annual', label: 'Upgrade to annual' }]
      : [];
  return (
    <>
      <Head>
        <title>Manage Billing | IELTS Bank</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <Navbar />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
          <div className="rounded-3xl bg-slate-950 p-7 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Billing choices</p>
            <h1 className="mt-2 text-3xl font-black">Choose what fits your test timeline</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Review your plan status, payment details, renewal choices, and the actions currently
              available for your account. There is no hidden exit.
            </p>
          </div>

          {pending ? (
            <p className="py-16 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading billing…</p>
          ) : planError ? (
            <div role="alert" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center text-sm font-semibold text-amber-900">
              {planError} Billing actions are temporarily disabled.
            </div>
          ) : !user ? (
            <div className="mt-6 rounded-2xl border bg-white p-6 text-center">
              <p className="font-bold">Sign in to manage billing.</p>
              <NextLink href="/dashboard" className="mt-3 inline-block text-sm font-semibold text-emerald-700">Go to dashboard</NextLink>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              <section className="rounded-2xl border bg-white p-6">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-1 h-5 w-5 text-emerald-600" />
                  <div>
                    <h2 className="font-bold">
                      {pauseActive
                        ? 'Premium is paused'
                        : pausePending
                          ? 'Billing is resuming'
                          : planStatus === 'canceled'
                            ? 'Premium is ending'
                            : planStatus === 'past_due'
                              ? 'Payment needs attention'
                              : expiresAt
                                ? 'Exam Pass is active'
                                : isPremium
                                  ? 'Keep Premium active'
                                  : 'Premium is not active'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {billingStatusMessage({
                        pauseUntil: effectivePauseUntil,
                        expiresAt,
                        planStatus,
                        renewsAt,
                        isPremium,
                      })}
                    </p>
                  </div>
                </div>
              </section>

              {isPremium && upgrades.length > 0 ? (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                  <div className="flex items-start gap-3">
                    <ArrowUpCircle className="mt-1 h-5 w-5 text-emerald-700" />
                    <div className="flex-1">
                      <h2 className="font-bold text-emerald-950">Upgrade your plan</h2>
                      <p className="mt-1 text-sm text-emerald-900/75">
                        Stripe automatically credits unused time on your current plan. You pay only
                        the prorated balance, and your new billing period starts today.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {upgrades.map((upgrade) => (
                          <Button
                            key={upgrade.sku}
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => upgradePlan(upgrade.sku)}
                          >
                            {busy === `upgrade:${upgrade.sku}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowUpCircle className="h-4 w-4" />
                            )}
                            {upgrade.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {canOfferBillingPause({
                isPremium,
                planStatus,
                renewsAt,
                expiresAt,
                pauseUsedAt: effectivePauseUsedAt,
              }) ? (
                <section className="rounded-2xl border bg-white p-6">
                  <div className="flex items-start gap-3">
                    <PauseCircle className="mt-1 h-5 w-5 text-amber-600" />
                    <div className="flex-1">
                      <h2 className="font-bold">Pause for 30 days</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Billing, invoices, and Premium access stop now. Stripe credits the unused
                        part of your paid period. In 30 days it applies that credit to a new billing
                        period, charges any remaining balance, and restores access after payment.
                      </p>
                      <Button type="button" variant="outline" className="mt-4" disabled={Boolean(busy)} onClick={pausePlan}>
                        {busy === 'pause' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                        Pause once
                      </Button>
                    </div>
                  </div>
                </section>
              ) : null}

              {canChangeRecurringPlan ? (
                <section className="rounded-2xl border bg-white p-6">
                  <div className="flex items-start gap-3">
                    <CalendarClock className="mt-1 h-5 w-5 text-blue-600" />
                    <div>
                      <h2 className="font-bold">Not sure how long you need?</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Plans stay active until the end of the period you have paid for, even after
                        you cancel — so you can cancel now and keep access until then.
                      </p>
                      <Button asChild variant="outline" className="mt-4">
                        <NextLink href="/pricing" className="no-underline">Compare plans</NextLink>
                      </Button>
                    </div>
                  </div>
                </section>
              ) : null}

              {hasBillingAccount ? (
                <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-1 h-5 w-5 text-rose-700" />
                    <div className="flex-1">
                      <h2 className="font-bold text-rose-950">
                        {planStatus === 'canceled'
                          ? 'Review your canceled plan'
                          : planStatus === 'past_due'
                            ? 'Update payment details'
                            : isPremium && !expiresAt
                              ? 'Change payment details or cancel'
                              : 'Review billing history'}
                      </h2>
                      <p className="mt-1 text-sm text-rose-900/75">
                        {planStatus === 'canceled'
                          ? 'Stripe has scheduled cancellation at period end. You keep access through the time you already paid for.'
                          : planStatus === 'past_due'
                            ? 'Update your payment method in Stripe. Premium remains in a temporary grace period while payment is resolved.'
                            : isPremium && !expiresAt
                              ? 'Stripe will collect one cancellation reason and schedule cancellation at period end. You keep access through the time you already paid for.'
                              : 'Stripe lets you review past invoices and saved billing details. There is no active recurring plan to cancel.'}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 border-rose-300"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          // Only intercept the healthy-plan path (the one that
                          // leads to cancellation), and only once.
                          const cancelIntent =
                            isPremium && !expiresAt && planStatus !== 'canceled' && planStatus !== 'past_due';
                          const pauseAvailable = canOfferBillingPause({
                            isPremium,
                            planStatus,
                            renewsAt,
                            expiresAt,
                            pauseUsedAt: effectivePauseUsedAt,
                          });
                          if (cancelIntent && pauseAvailable && !saveStepSeen) {
                            setSaveStepSeen(true);
                            setSaveStepOpen(true);
                            track('cancel_save_step', { stage: 'impression' });
                            return;
                          }
                          openPortal();
                        }}
                      >
                        {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                        Continue to Stripe
                      </Button>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          )}
          {message ? <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</p> : null}
          {error ? <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p> : null}
        </main>
        <Footer />
      </div>
      <Modal
        open={saveStepOpen}
        onClose={() => setSaveStepOpen(false)}
        title="Before you go — two things worth knowing"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            If you just need a break from prep, <strong>pausing for 30 days</strong> keeps your
            history and applies your unused-time credit when billing resumes — usually the
            better fit around a test date.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            And if you cancel and later prepare for a retake, returning subscribers get a
            discounted month by email — your scores and feedback stay saved either way.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => {
                setSaveStepOpen(false);
                track('cancel_save_step', { stage: 'pause' });
                pausePlan();
              }}
            >
              <PauseCircle className="h-4 w-4" />
              Pause instead
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => {
                setSaveStepOpen(false);
                track('cancel_save_step', { stage: 'continue_cancel' });
                openPortal();
              }}
            >
              Continue to cancel
            </Button>
          </div>
        </div>
      </Modal>
      <Sheet
        open={Boolean(upgradeQuote)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setUpgradeQuote(null);
            setQuoteMessage('');
          }
        }}
      >
        <SheetContent
          side="right"
          showClose={false}
          onClose={() => {
            if (!busy) {
              setUpgradeQuote(null);
              setQuoteMessage('');
            }
          }}
          aria-describedby="upgrade-quote-details"
          aria-labelledby="upgrade-quote-title"
        >
          <SheetHeader>
            <SheetTitle id="upgrade-quote-title">Review your plan upgrade</SheetTitle>
            <p id="upgrade-quote-details" className="text-sm text-muted-foreground">
              Stripe calculated this estimate using the unused time on your current plan. Nothing
              changes until you confirm.
            </p>
          </SheetHeader>
          {quoteMessage ? (
            <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              {quoteMessage}
            </p>
          ) : null}
          {upgradeQuote ? (
            <div className="grid gap-3 rounded-2xl border bg-card p-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">New plan price</span>
                <strong>
                  {formatMoney(upgradeQuote.targetAmount, upgradeQuote.currency)}{' '}
                  {cadenceLabel(upgradeQuote)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span className="text-muted-foreground">Estimated charge today</span>
                <strong className="text-base">
                  {formatMoney(upgradeQuote.amountDue, upgradeQuote.currency)}
                </strong>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                This estimate is valid for five minutes. If Stripe recalculates it, you will be
                shown the new amount and asked to confirm again.
              </p>
            </div>
          ) : null}
          <div className="mt-auto grid gap-2">
            <Button
              type="button"
              disabled={Boolean(busy) || !upgradeQuote}
              onClick={() => upgradePlan(upgradeQuote.targetSku, upgradeQuote)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
              Confirm upgrade and charge {formatMoney(upgradeQuote?.amountDue, upgradeQuote?.currency)}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => {
                setUpgradeQuote(null);
                setQuoteMessage('');
              }}
            >
              Keep current plan
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
