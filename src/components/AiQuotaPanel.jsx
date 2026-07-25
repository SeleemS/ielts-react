import * as React from 'react';
import NextLink from 'next/link';
import { Sparkles } from 'lucide-react';
import Modal from './AccessibleModal';
import { usePlan } from '../lib/usePlan';
import { track } from '../lib/analytics';
import { money, planPricing } from '../lib/saleConfig';

// Limit modal for AI-scoring CTAs. Writing includes one lifetime free sample;
// after that, this opens in two situations:
//   * a premium user hit a per-skill fair-use cap (or an IP limit) —
//     tell them when it resets, no upsell;
//   * a non-premium user hit a limit response we didn't route to /pricing —
//     show the premium pitch.
// The userId / remaining props are kept for call-site compatibility.
export default function AiQuotaPanel({ open = false, onClose = () => {}, skill = 'speaking' }) {
  const { isPremium, loading } = usePlan();
  const impressionRef = React.useRef(false);

  const skillLabel = skill === 'writing' ? 'Writing' : 'Speaking';

  React.useEffect(() => {
    if (!open || loading) {
      impressionRef.current = false;
      return;
    }
    if (impressionRef.current) return;
    impressionRef.current = true;
    track('premium_gate', {
      source: 'quota_modal',
      stage: 'impression',
      skill,
      premium: isPremium,
    });
  }, [isPremium, loading, open, skill]);

  return (
    <Modal
      open={open && !loading}
      onClose={onClose}
      title={isPremium ? 'You’ve hit a fair-use limit' : `AI ${skillLabel} scoring is a Premium feature`}
    >
      <div className="space-y-5">
        {isPremium ? (
          <p className="text-sm leading-6 text-muted-foreground">
            You’ve used your included AI {skillLabel} scores for this period. Your
            allowance resets automatically — review your saved feedback on the dashboard
            in the meantime.
          </p>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted-foreground">
              {skill === 'writing'
                ? 'You’ve used your lifetime free Writing sample. Upgrade to unlock the complete report and continued scoring:'
                : 'AI Speaking scoring is part of Premium. Upgrade to unlock:'}
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
              <li>Writing and Speaking AI band scores with clear fair-use limits</li>
              <li>Criterion-by-criterion feedback and progress tracking</li>
              <li>Live AI examiner minutes and an ad-free experience</li>
            </ul>
            <NextLink
              href={`/pricing?upgrade=${skill}`}
              onClick={() => track('paywall_upgrade_click', { source: 'quota_modal', skill })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground no-underline hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" />
              Upgrade to Premium
            </NextLink>
            <p className="text-center text-xs text-muted-foreground">
              From {money(planPricing('3month', false).perMonth)}/mo — cancel anytime.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
