import * as React from 'react';
import NextLink from 'next/link';
import { Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { EXAM_PASS_DAYS, WEEK_PASS_DAYS, WEEK_PASS_ENABLED, money, planPricing } from '../../lib/saleConfig';
import { useVisitorMarket } from '../../lib/useVisitorMarket';
import { useDirectCheckout } from '../../lib/useDirectCheckout';
import { track } from '../../lib/analytics';

// The plans a gate offers, each one click from Stripe. The Week Pass leads:
// it was the most-picked plan in Oct 2026 and is the smallest commitment.
export function quickCheckoutOptions(ppp = false, weekPassEnabled = WEEK_PASS_ENABLED) {
  const week = weekPassEnabled ? planPricing('week_pass', ppp) : null;
  const pass = planPricing('exam_pass', ppp);
  const monthly = planPricing('monthly', ppp);
  return [
    week && {
      sku: 'week_pass',
      label: `${WEEK_PASS_DAYS} days of Pro`,
      price: money(week.price),
      note: 'One payment · no auto-renew',
    },
    pass && {
      sku: 'exam_pass',
      label: `${EXAM_PASS_DAYS} days of Pro`,
      price: money(pass.price),
      note: `Exam Pass · one payment · about ${money(Math.round((pass.price / (pass.days || EXAM_PASS_DAYS)) * 100) / 100)} a day`,
    },
    monthly && {
      sku: 'monthly',
      label: 'Monthly',
      price: `${money(monthly.price)}/mo`,
      note: 'Renews monthly · cancel anytime',
    },
  ].filter(Boolean);
}

// `onSelect`/`busySku` let the pricing page drive its own checkout flow
// (sign-in resume, winback offers) through the same buttons.
export default function QuickCheckout({ upgrade, stage = 'saved', returnTo = '', source, className, onSelect, busySku: busyOverride, compareHref }) {
  const { ppp } = useVisitorMarket();
  const direct = useDirectCheckout({ upgrade, stage, returnTo, ppp, source });
  const start = onSelect || direct.start;
  const busySku = onSelect ? busyOverride : direct.busySku;
  const { error, pricingHref } = direct;
  const options = quickCheckoutOptions(ppp);
  const viewed = React.useRef(false);
  React.useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track('quick_checkout_view', { source: source || upgrade, ppp });
  }, [source, upgrade, ppp]);

  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="quick-checkout">
      {options.map((option, index) => {
        const primary = index === 0;
        const busy = busySku === option.sku;
        return (
          <button
            key={option.sku}
            type="button"
            disabled={Boolean(busySku)}
            onClick={() => start(option.sku)}
            data-sku={option.sku}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-70',
              primary
                ? 'border-accent bg-accent text-accent-foreground hover:bg-accent/90'
                : 'border-border bg-card text-foreground hover:border-accent/60'
            )}
          >
            <span className="flex flex-col">
              <span className="text-sm font-bold">{option.label}</span>
              <span className={cn('text-xs', primary ? 'text-accent-foreground/85' : 'text-muted-foreground')}>
                {option.note}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-base font-bold">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {busy ? 'Opening…' : option.price}
            </span>
          </button>
        );
      })}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}{' '}
          <NextLink href={pricingHref()} className="underline">
            See all plans
          </NextLink>
        </p>
      ) : null}
      <p className="mt-1 inline-flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
        14-day money-back guarantee · secure checkout by Stripe ·{' '}
        <NextLink
          href={compareHref || pricingHref()}
          className="font-semibold text-foreground underline"
          onClick={() => track('quick_checkout_compare_click', { source: source || upgrade })}
        >
          Compare plans
        </NextLink>
      </p>
    </div>
  );
}
