import * as React from 'react';
import NextLink from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import AccessibleModal from '../AccessibleModal';
import { Button } from '../../../components/ui/button';
import { buildUpgradeHref } from '../../../lib/upgradeContext';
import { FREE_PRACTICE_TESTS } from '../../../lib/practiceAllowance';
import { EXAM_PASS_DAYS, WEEK_PASS_DAYS, WEEK_PASS_ENABLED, money, planPricing } from '../../lib/saleConfig';
import { useVisitorMarket } from '../../lib/useVisitorMarket';
import { track } from '../../lib/analytics';

const POINTS = [
  'Unlimited marked Reading & Listening practice with band estimates',
  'Full AI Writing reports and Speaking scoring',
  'Timed full-length mock tests and band trends',
];

// Shown to a signed-in free learner submitting a NEW passage after the free
// allowance is used. Their answers stay autosaved on this page, so returning
// after checkout lets them submit and see the score.
export default function PracticeLimitDialog({ open, onClose, skill, slug, used }) {
  const { ppp } = useVisitorMarket();
  const [returnTo, setReturnTo] = React.useState('');
  React.useEffect(() => {
    if (open) setReturnTo(window.location.pathname);
  }, [open]);
  React.useEffect(() => {
    if (open) track('paywall_view', { source: 'practice_limit', skill, slug, used, limit: FREE_PRACTICE_TESTS });
  }, [open, skill, slug, used]);

  const pass = planPricing('exam_pass', ppp);
  const monthly = planPricing('monthly', ppp);
  const week = WEEK_PASS_ENABLED ? planPricing('week_pass', ppp) : null;
  const href = buildUpgradeHref({ upgrade: 'practice', stage: 'saved', return_to: returnTo });

  return (
    <AccessibleModal
      open={open}
      onClose={onClose}
      title={`You've used your ${FREE_PRACTICE_TESTS} free practice tests`}
      analyticsId="practice_limit_dialog"
    >
      <p className="text-sm text-muted-foreground">
        Your answers on this passage are saved. Upgrade to see your score now and keep practising
        without limits.
      </p>
      <ul className="mt-4 space-y-2">
        {POINTS.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            {point}
          </li>
        ))}
      </ul>
      <Button asChild variant="accent" size="lg" className="mt-6 w-full">
        <NextLink
          href={href}
          className="no-underline"
          onClick={() => track('paywall_upgrade_click', { source: 'practice_limit', skill, slug })}
        >
          {pass ? `Get the ${EXAM_PASS_DAYS}-day Exam Pass — ${money(pass.price)}` : 'See Pro plans'}
        </NextLink>
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        One payment, never renews{monthly ? ` · or ${money(monthly.price)}/month, cancel anytime` : ''} · 14-day money-back guarantee
      </p>
      {week ? (
        <p className="mt-3 text-center text-sm">
          <NextLink
            href={`${href}#week-pass`}
            className="font-semibold text-foreground underline"
            onClick={() => track('paywall_upgrade_click', { source: 'practice_limit', skill, slug, sku: 'week_pass' })}
          >
            Just this week? Try {WEEK_PASS_DAYS} days for {money(week.price)}
          </NextLink>
        </p>
      ) : null}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Questions and answer keys stay free to read.{' '}
        <button type="button" onClick={onClose} className="font-semibold text-foreground underline">
          Not now
        </button>
      </p>
    </AccessibleModal>
  );
}
